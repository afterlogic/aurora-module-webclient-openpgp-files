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
	ConfirmPopup = require('%PathToCoreWebclientModule%/js/popups/ConfirmPopup.js'),
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

OpenPgpFileProcessor.prototype.processFileEncryption = async function (oFile, oFilesView, sRecipientEmail, bIsPasswordMode)
{
	this.oFile = oFile;
	this.oFilesView = oFilesView;
	this.sPath = oFilesView.currentPath();
	this.sStorageType = oFilesView.storageType();
	let oResultData = {result: false};
	const sNewFileName = this.getGPGFileName(this.oFile.fileName(), sRecipientEmail);
	//check if a file with the same name already exists
	const bIsGPGFileAlreadyExists = !!this.oFilesView.filesCollection().find(oFile => {
		return oFile.displayName() === sNewFileName;
	});
	let bIsReplaceExistingFile = false;
	if (bIsGPGFileAlreadyExists)
	{
		//propose the user to replace the existing file with a new one
		bIsReplaceExistingFile = await this.isReplaceExistingFile(sNewFileName, sRecipientEmail);
	}
	if (!bIsGPGFileAlreadyExists || bIsReplaceExistingFile)
	{
		const oBlob = await this.downloadFile();
		if (oBlob instanceof Blob)
		{
			//file encryption
			const oEncryptionResult = await OpenPgpEncryptor.encryptData(
				oBlob,
				sRecipientEmail,
				bIsPasswordMode
			);
			if (!oEncryptionResult.result)
			{
				ErrorsUtils.showPgpErrorByCode(oEncryptionResult, Enums.PgpAction.Encrypt);
			}
			else
			{
				let {data, password} = oEncryptionResult.result;
				let oEncryptedBlob = new Blob([data], {type: "octet/stream", lastModified: new Date()});
				//uploading of encrypted file
				let bUploadResult = await this.uploadFile(oEncryptedBlob, sNewFileName, sRecipientEmail, password);
				if (bUploadResult)
				{//creating a public link
					let oPublicLinkResult = await this.createPublicLink(
						this.oFile.storageType(),
						this.oFile.path(),
						sNewFileName,
						oEncryptedBlob.size
					);
					if (oPublicLinkResult.result)
					{
						this.oFilesView.refresh();
						oResultData.result = true;
						oResultData.password = password;
						oResultData.link = oPublicLinkResult.link;
					}
				}
			}
		}
	}

	this.oFile = null;
	this.oFilesView = null;
	this.sStorageType = null;
	this.sPath = null;

	return oResultData;
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

OpenPgpFileProcessor.prototype.uploadFile = async function (oBlob, sNewFileName, sRecipientEmail, sPassword)
{
	let oFormData = new FormData();
	let oParameters = {
		Type:			this.sStorageType,
		Path:			this.sPath,
		SubPath:		'',
		ExtendedProps:	{
			PgpEncryptionMode: sPassword ? Enums.EncryptionBasedOn.Password : Enums.EncryptionBasedOn.Key,
			PgpEncryptionRecipientEmail: sRecipientEmail
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
				'Authorization': 'Bearer ' + $.cookie('AuthToken'),
				'x-client': 'WebClient'
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

OpenPgpFileProcessor.prototype.createPublicLink = async function (sType, sPath, sFileName, iSize, bEncryptLink = false)
{
	let sLink = '';
	let oResult = {result: false};
	const sPassword = bEncryptLink ? OpenPgpEncryptor.generatePassword() : '';
	const oPromiseCreatePublicLink = new Promise( (resolve, reject) => {
		const fResponseCallback = (oResponse, oRequest) => {
			if (oResponse.Result && oResponse.Result.link)
			{
				resolve(oResponse.Result.link);
			}
			reject(new Error(TextUtils.i18n('%MODULENAME%/ERROR_PUBLIC_LINK_CREATION')));
		};
		let oParams = {
			'Type': sType,
			'Path': sPath,
			'Name': sFileName,
			'Size': iSize,
			'IsFolder': false,
			'Password': sPassword
		};

		Ajax.send(
			'OpenPgpFilesWebclient',
			'CreatePublicLink',
			oParams, 
			fResponseCallback,
			this
		);
	});
	try
	{
		sLink = await oPromiseCreatePublicLink;
		oResult.result = true;
		oResult.link = sLink;
		oResult.password = sPassword;
	}
	catch (oError)
	{
		if (oError && oError.message)
		{
			Screens.showError(oError.message);
		}
	}

	return oResult;
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
			this.saveBlob(oDecryptionResult.blob, this.getFileNameForDownload(sFileName, sRecipientEmail));
			return true;
		}
	}
	else
	{
		return false;
	}
};

OpenPgpFileProcessor.prototype.getFileNameForDownload = function (sFileName, sRecipientEmail)
{
	const sFileNameWithoutExtension = Utils.getFileNameWithoutExtension(sFileName);
	const sDelimiter = '_' + sRecipientEmail;
	const aNameParts = sFileNameWithoutExtension.split(sDelimiter);
	let sNewName = '';
	if (aNameParts.length <= 2)
	{
		sNewName = aNameParts.join('');
	}
	else
	{
		//If the files name contains more than one entry of a recipient email, only the last entry is removed
		for (let i = 0; i < aNameParts.length; i++)
		{
			sNewName += aNameParts[i];
			sNewName += i < (aNameParts.length - 2) ? sDelimiter : '';
		}
	}

	return sNewName;
};

OpenPgpFileProcessor.prototype.isReplaceExistingFile = async function (sFileName, sRecipientEmail)
{
	let bResult = false;
	let oPromiseIsReplaceExistingFile = new Promise(async (resolve, reject) => {
		const fCallback = bOk => {
			if (bOk)
			{
				resolve(true);
			}
			else
			{
				resolve(false);
			}
		};
		//showing popup
		Popups.showPopup(ConfirmPopup, [
			TextUtils.i18n('%MODULENAME%/MESSAGE_FILE_IS_ALREADY_SHARED', {'EMAIL': sRecipientEmail}),
			fCallback
		]);
	});

	bResult = await oPromiseIsReplaceExistingFile;

	return bResult;
};

module.exports = new OpenPgpFileProcessor();
