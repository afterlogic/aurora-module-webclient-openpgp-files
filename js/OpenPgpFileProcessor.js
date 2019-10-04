'use strict';

let
	_ = require('underscore'),
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
	this.sStorageType = null;
	this.sPath = null;
}

OpenPgpFileProcessor.prototype.processFileEncryption = async function (oFile, oFilesView)
{
	this.oFile = oFile;
	this.oFilesView = oFilesView;
	this.sPath = oFilesView.currentPath();
	this.sStorageType = oFilesView.storageType();
	let oResultData = {result: false};
	let oEncryptionResult = await this.encryptFile();
	if (oEncryptionResult && oEncryptionResult.result)
	{
		//add gpg extension to encrypted file
		const sNewFileName = this.getGPGFileName(this.oFile.fileName(), oEncryptionResult.recipientEmail);
		let bUploadResult = await this.uploadFile(oEncryptionResult.blob, sNewFileName, oEncryptionResult);
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
	this.oFile = null;
	this.oFilesView = null;
	this.sStorageType = null;
	this.sPath = null;
};

OpenPgpFileProcessor.prototype.downloadFile = async function ()
{
	let oPromiseDownloadFile = new Promise(async (resolve, reject) => {
		const fResultCallback = (oBlob) => {
			resolve(oBlob);
		};
		if (this.oFile.bIsSecure())
		{//download file encrypted with other modules
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
				let fIleContent = await this.getFileContentByUrl(
					sDownloadUrl,
					iReceivedLength => {
						this.oFile.onDownloadProgress(iReceivedLength, this.oFile.size());
					}
				);
				if (fIleContent instanceof Blob)
				{
					fResultCallback(fIleContent);
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

OpenPgpFileProcessor.prototype.encryptFile = async function ()
{
	let oResult = {
		result: false
	};
	let oPromiseEncryptFile = new Promise(async (resolve, reject) => {
		const fResolveCallback = async (recipientEmail, isPasswordMode) => {
			let oBlob = await this.downloadFile();
			if (oBlob instanceof Blob)
			{
				//file encryption
				let oEncryptionResult = await OpenPgpEncryptor.encryptData(
					oBlob,
					recipientEmail,
					isPasswordMode
				);
				if (!oEncryptionResult.result)
				{
					ErrorsUtils.showPgpErrorByCode(oEncryptionResult, Enums.PgpAction.Encrypt);
				}
				else
				{
					let {data, password} = oEncryptionResult.result;
					let oResBlob = new Blob([data], {type: "octet/stream", lastModified: new Date()});
					let oResult = {
						result: true,
						blob: oResBlob,
						password: password,
						recipientEmail: recipientEmail
					};
					resolve(oResult);

					return false;
				}
			}

			return true;
		};
		const fRejectCallback = () => {
			reject(false);
		};
		//showing popup to select recipient and encryption mode
		Popups.showPopup(EncryptFilePopup, [
			fResolveCallback,
			fRejectCallback
		]);
	});

	try
	{
		oResult = await oPromiseEncryptFile;
	}
	catch (oError)
	{}

	return oResult;
};

OpenPgpFileProcessor.prototype.decryptFile = async function (oBlob, sRecipientEmail, sPassword, bPasswordBasedEncryption)
{
	let oResult = {
		result: false
	};

	try
	{
		//file decryption
		let oDecryptionResult = await OpenPgpEncryptor.decryptData(
			oBlob,
			sRecipientEmail,
			sPassword,
			bPasswordBasedEncryption
		);

		if (!oDecryptionResult.result)
		{
			ErrorsUtils.showPgpErrorByCode(oDecryptionResult, Enums.PgpAction.DecryptVerify);
		}
		else
		{
			let data = oDecryptionResult.result;
			let oResBlob = new Blob([data], {type: "octet/stream", lastModified: new Date()});
			oResult.result = true;
			oResult.blob = oResBlob;
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

OpenPgpFileProcessor.prototype.uploadFile = async function (oBlob, sNewFileName, oEncryptionResult)
{
	let oFormData = new FormData();
	let {password, recipientEmail} = oEncryptionResult;
	let oParameters = {
		Type:			this.sStorageType,
		Path:			this.sPath,
		SubPath:		'',
		ExtendedProps:	{
			PgpEncryptionMode: password ? Enums.EncryptionBasedOn.Password : Enums.EncryptionBasedOn.Key,
			PgpEncryptionRecipientEmail: recipientEmail
		}
	};
	oFormData.append('uploader', oBlob, sNewFileName);
	oFormData.append('Module', 'Files');
	oFormData.append('Method', 'UploadFile');
	oFormData.append('Parameters', JSON.stringify(oParameters));
	let oResponse = await fetch(
		'?/Api/',
		{
			method: 'POST',
			headers: {
				'Authorization': 'Bearer ' + $.cookie('AuthToken')
			},
			body: oFormData
		}
	);

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

OpenPgpFileProcessor.prototype.getFileContentByUrl = async function (sDownloadUrl, onDownloadProgressCallback)
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
			if (_.isFunction(onDownloadProgressCallback))
			{
				onDownloadProgressCallback(iReceivedLength);
			}
		}

		return new Blob(aChunks);
	}
	else
	{
		return false;
	}
};

OpenPgpFileProcessor.prototype.saveBlob = async function (oBlob, sFileName)
{
	if (window.navigator && window.navigator.msSaveOrOpenBlob) {
		window.navigator.msSaveOrOpenBlob(oBlob, sFileName);
		return;
	}
	let blobUrl = window.URL.createObjectURL(oBlob);
	let link = document.createElement("a");
	link.href = blobUrl;
	link.download = sFileName;
	document.body.appendChild(link);
	link.click();
	window.URL.revokeObjectURL(blobUrl);
};

OpenPgpFileProcessor.prototype.processFileDecryption = async function (sFileName, sDownloadUrl, sRecipientEmail, sPassword, sEncryptionMode)
{
	let oBlob = await this.getFileContentByUrl(sDownloadUrl);
	if (oBlob instanceof Blob)
	{
		let oDecryptionResult = await this.decryptFile(oBlob, sRecipientEmail, sPassword, sEncryptionMode === Enums.EncryptionBasedOn.Password);
		if (oDecryptionResult.result)
		{
			this.saveBlob(oDecryptionResult.blob, Utils.getFileNameWithoutExtension(sFileName));
			return true;
		}
	}
	else
	{
		return false;
	}
};

module.exports = new OpenPgpFileProcessor();
