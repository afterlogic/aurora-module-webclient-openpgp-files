'use strict';

let
	$ = require('jquery'),

	App = require('%PathToCoreWebclientModule%/js/App.js'),
	Ajax = require('%PathToCoreWebclientModule%/js/Ajax.js'),
	Screens = require('%PathToCoreWebclientModule%/js/Screens.js'),
	TextUtils = require('%PathToCoreWebclientModule%/js/utils/Text.js'),
	Utils = require('%PathToCoreWebclientModule%/js/utils/Common.js'),
	ErrorsUtils = require('modules/%ModuleName%/js/utils/Errors.js'),
	UrlUtils = require('%PathToCoreWebclientModule%/js/utils/Url.js'),
	
	Popups = require('%PathToCoreWebclientModule%/js/Popups.js'),
	AlertPopup = require('%PathToCoreWebclientModule%/js/popups/AlertPopup.js'),
	EncryptFilePopup =  require('modules/%ModuleName%/js/popups/EncryptFilePopup.js'),
	OpenPgpEncryptor = require('modules/%ModuleName%/js/OpenPgpEncryptor.js')
;

/**
 * @constructor
 */
function OpenPgpFileProcessor()
{
	this.oFile = null;
	this.oFilesView = null;
}

OpenPgpFileProcessor.prototype.processFile = async function (oFile, oFilesView)
{
	this.oFile = oFile;
	this.oFilesView = oFilesView;
	let oBlob = await this.downloadFile();
	let oResultData = {result: false};
	if (oBlob instanceof Blob)
	{
		let oEncryptionResult = await this.encryptFile(oBlob);
		if (oEncryptionResult && oEncryptionResult.result)
		{
			//add gpg extension to encrypted file
			const sNewFileName = this.getGPGFileName(this.oFile.fileName(), oEncryptionResult.recipientEmail);
			let bUploadResult = await this.uploadFile(oEncryptionResult.blob, sNewFileName);
			if (bUploadResult)
				{
					let sPublicLink = await this.createPublicLink(
						this.oFile.storageType(),
						this.oFile.path(),
						sNewFileName,
						oEncryptionResult.blob.size
					);
					if (sPublicLink)
					{
						this.oFilesView.refresh();
						oResultData.result = true;
						oResultData.password = oEncryptionResult.password;
						oResultData.link = sPublicLink;
					}
				}
		}
		EncryptFilePopup.showResults(oResultData);
	}
};

OpenPgpFileProcessor.prototype.downloadFile = async function ()
{
	let oPromiseDownloadFile = new Promise(async (resolve, reject) => {
		const fResultCallback = (oBlob) => {
			resolve(oBlob);
		};
		if (this.oFile.bIsSecure())
		{//download encrypted file
			App.broadcastEvent('OpenPgpFilesWebclient::DownloadSecureFile', {
				File: this.oFile,
				fProcessBlobCallback: fResultCallback
			});
		}
		else
		{//downloading an unencrypted file
			const sDownloadUrl = this.oFile.getActionUrl('download');
			if (sDownloadUrl)
			{
				let response = await fetch(sDownloadUrl);
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
					fResultCallback(new Blob(aChunks));
				}
				else
				{
					reject(new Error(TextUtils.i18n('%MODULENAME%/ERROR_ON_DOWNLOAD')));
				}
			}
			else
			{
				reject(new Error(TextUtils.i18n('%MODULENAME%/ERROR_DOWNLOAD_IS_UNAVAILABLE')));
			}
		}
	});

	let oBlob = false;
	try
	{
		oBlob = await oPromiseDownloadFile;
	}
	catch (oError)
	{
		if (oError && oError.message)
		{
			Screens.showError(oError.message);
		}

		return false;
	}

	return oBlob;
};

OpenPgpFileProcessor.prototype.encryptFile = async function (oBlob)
{
	let oResult = {
		result: false
	};
	let oPromiseSelectKeyOrPassword = new Promise(async (resolve, reject) => {
		const fResolveCallback = (recipientEmail, isPasswordMode) => {
			resolve({
				recipientEmail: recipientEmail,
				isPasswordMode: isPasswordMode
			});
		};
		const fRejectCallback = () => {
			reject(false);
		};
		Popups.showPopup(EncryptFilePopup, [
			fResolveCallback,
			fRejectCallback
		]);
	});

	try
	{
		//showing popup to select recipient and encryption mode
		let {recipientEmail, isPasswordMode} = await oPromiseSelectKeyOrPassword;
		//file encryption
		let oEncryptionResult = await OpenPgpEncryptor.encryptData(
			oBlob,
			recipientEmail,
			isPasswordMode
		);
		let oResult = {
			result: false
		};
		if (!oEncryptionResult.result)
		{
			ErrorsUtils.showPgpErrorByCode(oEncryptionResult, Enums.PgpAction.Encrypt);
		}
		else
		{
			let {data, password} = oEncryptionResult.result;
			let oResBlob = new Blob([data], {type: "text/plain", lastModified: new Date()});
			oResult.result = true;
			oResult.blob = oResBlob;
			oResult.password = password;
			oResult.recipientEmail = recipientEmail;
		}

		return oResult;
	}
	catch (oError)
	{
		return oResult;
	}
};

OpenPgpFileProcessor.prototype.getGPGFileName = function (sFileName, sRecipientEmail)
{
	const sFileNameExt = Utils.getFileExtension(sFileName);
	const sFileNameWoExt = Utils.getFileNameWithoutExtension(sFileName);

	return sFileNameWoExt + '_' + sRecipientEmail + '.' + sFileNameExt + '.gpg';
};

OpenPgpFileProcessor.prototype.uploadFile = async function (oBlob, sNewFileName)
{
	let oFormData = new FormData();
	let oParameters = {
		Type:	this.oFilesView.storageType(),
		Path:		this.oFilesView.currentPath(),
		SubPath:	''
	};
	oFormData.append('uploader', oBlob, sNewFileName);
	oFormData.append('Module', 'Files');
	oFormData.append('Method', 'UploadFile');
	oFormData.append('Parameters', JSON.stringify(oParameters));
	let oResponse = await fetch('?/Api/', {
		method: 'POST',
		headers: {
			'Authorization': 'Bearer ' + $.cookie('AuthToken')
		},
		body: oFormData
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

OpenPgpFileProcessor.prototype.createPublicLink = async function (sType, sPath, sNewFileName, iSize)
{
	let sLink = '';
	let oPromiseCreatePublicLink = new Promise( (resolve, reject) => {
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
	});
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

module.exports = new OpenPgpFileProcessor();
