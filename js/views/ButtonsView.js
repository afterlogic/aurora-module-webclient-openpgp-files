'use strict';

var
	ko = require('knockout'),
	$ = require('jquery'),

	App = require('%PathToCoreWebclientModule%/js/App.js'),
	Ajax = require('%PathToCoreWebclientModule%/js/Ajax.js'),
	CFileModel = require('modules/FilesWebclient/js/models/CFileModel.js'),
	Screens = require('%PathToCoreWebclientModule%/js/Screens.js'),
	TextUtils = require('%PathToCoreWebclientModule%/js/utils/Text.js'),
	Utils = require('%PathToCoreWebclientModule%/js/utils/Common.js'),
	ErrorsUtils = require('modules/%ModuleName%/js/utils/Errors.js'),
	UrlUtils = require('%PathToCoreWebclientModule%/js/utils/Url.js'),
	
	Popups = require('%PathToCoreWebclientModule%/js/Popups.js'),
	AlertPopup = require('%PathToCoreWebclientModule%/js/popups/AlertPopup.js'),
	SelectKeyOrPasswordPopup =  require('modules/%ModuleName%/js/popups/SelectKeyOrPasswordPopup.js'),
	OpenPgpEncryptor = require('modules/%ModuleName%/js/OpenPgpEncryptor.js')
;

/**
 * @constructor
 */
function ButtonsView()
{
	this.oFilesView = null;
	this.isUploadEnabled = ko.observable(false);
	this.oFile = null;
}

ButtonsView.prototype.ViewTemplate = '%ModuleName%_ButtonsView';

ButtonsView.prototype.useFilesViewData = function (oFilesView)
{
	let fEncryptBlobCallback = (oBlob) => {
		this.encryptAndUploadFile(oBlob);
	};

	let selectedItem = oFilesView.selector.itemSelected;
	this.oFilesView = oFilesView;
	this.secureShareCommand = Utils.createCommand(this,
		async () => {
			if (selectedItem().bIsSecure())
			{
				App.broadcastEvent('OpenPgpFilesWebclient::DownloadSecureFile', {
					File: selectedItem(),
					fProcessBlobCallback: fEncryptBlobCallback
				});
				
			}
			else if (selectedItem().getActionUrl('download'))
			{
				let response = await fetch(selectedItem().getActionUrl('download'));
				this.oFile = selectedItem();
				if (response.ok)
				{
					const reader = response.body.getReader();
					let iReceivedLength = 0;
					let aChunks = [];
					while (true)
					{
						const {done, value} = await reader.read();
						if (done)
						{
							break;
						}
						iReceivedLength += value.length;
						aChunks.push(value);
						this.oFile.onDownloadProgress(iReceivedLength, this.oFile.size());
					}
					fEncryptBlobCallback(new Blob(aChunks));
				}
				else
				{
					Screens.showError(TextUtils.i18n('%MODULENAME%/ERROR_ON_DOWNLOAD'));
				}
			}
			else
			{
				Screens.showError(TextUtils.i18n('%MODULENAME%/ERROR_DOWNLOAD_IS_UNAVAILABLE'));
			}
		},
		() => {
			return selectedItem() !== null && this.oFilesView.selector.listCheckedAndSelected().length === 1 && selectedItem() instanceof CFileModel;
		}
	);
};

ButtonsView.prototype.encryptAndUploadFile = function (oBlob)
{
	Popups.showPopup(SelectKeyOrPasswordPopup, [
		async (sRecipientEmail, bPasswordBasedEncryption) => {
			let oEncryptionResult = await OpenPgpEncryptor.encryptData(
				oBlob,
				sRecipientEmail,
				bPasswordBasedEncryption
			);
			let oResult = {
				result: false
			};
			if (!oEncryptionResult.result)
			{
				ErrorsUtils.showPgpErrorByCode(oEncryptionResult, Enums.PgpAction.Encrypt)
			}
			else
			{
				let {data, password} = oEncryptionResult.result;
				let oResBlob = new Blob([data], {type: "text/plain", lastModified: new Date()});
				const sNewFileName = this.getGPGFileName(this.oFile.fileName(), sRecipientEmail);
				let bUploadResult = await this.uploadFile(oResBlob, sNewFileName);
				if (bUploadResult)
				{
					let sPublicLink = await this.createPublicLink(
						this.oFile.storageType(),
						this.oFile.path(),
						sNewFileName,
						oResBlob.size
					);
					if (sPublicLink)
					{
						this.oFilesView.refresh();
						oResult.result = true;
						oResult.password = password;
						oResult.link = sPublicLink;
					}
				}
			}

			return oResult;
		},
		() => {}
	]);
};

ButtonsView.prototype.uploadFile = async function (oBlob, sNewFileName)
{
	let oFormData = new FormData();
	let oParameters = {
		Type:	this.oFilesView.storageType(),
		Path:		this.oFilesView.currentPath(),
		SubPath:	'',
	};
	oFormData.append('uploader', oBlob, sNewFileName);
	oFormData.append('Module', 'Files');
	oFormData.append('Method', 'UploadFile');
	oFormData.append('Parameters', JSON.stringify(oParameters));
	let oResponse = await fetch('?/Api/', {
		method: 'POST',
		headers: {
			'Authorization': 'Bearer ' + $.cookie('AuthToken'),
		},
		body: oFormData,
	  });

	let oResult = await oResponse.json();
	if (oResult.Result && !oResult.ErrorCode)
	{
		return true;
	}
	else if (oResult.ErrorCode)
	{
		switch (oResult.ErrorCode)
		{
			case Enums.Errors.CanNotUploadFileQuota:
				Popups.showPopup(AlertPopup, [TextUtils.i18n('COREWEBCLIENT/ERROR_CANT_UPLOAD_FILE_QUOTA')]);
				break;
			case Enums.Errors.FileAlreadyExists:
				Screens.showError(TextUtils.i18n('COREWEBCLIENT/ERROR_FILE_ALREADY_EXISTS'));
				break;
			case Enums.Errors.FileNotFound:
				Screens.showError(TextUtils.i18n('COREWEBCLIENT/ERROR_FILE_NOT_FOUND'));
				break;
			default:
				Screens.showError(TextUtils.i18n('COREWEBCLIENT/ERROR_UNKNOWN'));
		}
	}
	else
	{
		Screens.showError(TextUtils.i18n('COREWEBCLIENT/ERROR_UNKNOWN'));
	}

	return false;
};

ButtonsView.prototype.createPublicLink = async function (sType, sPath, sNewFileName, iSize)
{
	let sLink = '';
	let oPromiseCreatePublicLink = new Promise(function (resolve, reject) {
		const fResponseCallback = (oResponse, oRequest) => {
			if (oResponse.Result)
			{
				resolve(UrlUtils.getAppPath() + oResponse.Result);
			}
			reject(new Error(TextUtils.i18n('%MODULENAME%/ERROR_PUBLIC_LINK_CREATION')));
		};
		Ajax.send(
			'Files',
			'CreatePublicLink',
			{
				'Type': sType,
				'Path': sPath,
				'Name': sNewFileName,
				'Size': iSize,
				'IsFolder': false
			}, 
			fResponseCallback,
			this
		);
	}.bind(this));
	try
	{
		sLink = await oPromiseCreatePublicLink;
	}
	catch (oError)
	{
		if (oError && oError.message)
		{
			Screens.showError(oError.message);
		}

		return false;
	}

	return sLink;
};

ButtonsView.prototype.getGPGFileName = function (sFileName, sRecipientEmail)
{
	const sFileNameExt = Utils.getFileExtension(sFileName);
	const sFileNameWoExt = Utils.getFileNameWithoutExtension(sFileName);

	return sFileNameWoExt + '_' + sRecipientEmail + '.' + sFileNameExt + '.gpg';
};

module.exports = new ButtonsView();
