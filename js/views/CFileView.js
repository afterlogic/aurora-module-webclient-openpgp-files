'use strict';

let
	_ = require('underscore'),
	ko = require('knockout'),

	TextUtils = require('%PathToCoreWebclientModule%/js/utils/Text.js'),
	Settings = require('modules/%ModuleName%/js/Settings.js'),

	CAbstractScreenView = require('%PathToCoreWebclientModule%/js/views/CAbstractScreenView.js'),
	OpenPgpFileProcessor = require('modules/%ModuleName%/js/OpenPgpFileProcessor.js'),
	OpenPgpEncryptor = require('modules/%ModuleName%/js/OpenPgpEncryptor.js')
;

/**
* @constructor
*/
function CFileView()
{
	CAbstractScreenView.call(this, '%ModuleName%');

	this.password = ko.observable('');
	this.isDecryptionAvailable = ko.observable(true);
	this.isDownloadingAndDecrypting = ko.observable(false);
	this.browserTitle = ko.observable(TextUtils.i18n('%MODULENAME%/HEADING_BROWSER_TAB'));
	this.fileName = Settings.PublicFileData.Name ? Settings.PublicFileData.Name : '';
	this.fileSize = Settings.PublicFileData.Size ? Settings.PublicFileData.Size : '';
	this.fileUrl = Settings.PublicFileData.Url ? Settings.PublicFileData.Url : '';
	this.encryptionMode = Settings.PublicFileData.PgpEncryptionMode ? Settings.PublicFileData.PgpEncryptionMode : '';
	this.recipientEmail = Settings.PublicFileData.PgpEncryptionRecipientEmail ? Settings.PublicFileData.PgpEncryptionRecipientEmail : '';
	switch (this.encryptionMode)
	{
		case Enums.EncryptionBasedOn.Key:
			this.passwordLabel = "Enter passphrase for PGP key " + this.recipientEmail;
			break;
		case Enums.EncryptionBasedOn.Password:
			this.passwordLabel = "Enter password";
			break;
		default:
			//Encryption mode not defined
			this.passwordLabel = "";
			this.isDecryptionAvailable(false);
	}
}

_.extendOwn(CFileView.prototype, CAbstractScreenView.prototype);

CFileView.prototype.ViewTemplate = '%ModuleName%_FileView';
CFileView.prototype.ViewConstructorName = 'CFileView';

CFileView.prototype.onShow = async function ()
{
	if (this.encryptionMode === Enums.EncryptionBasedOn.Key)
	{//if encryption is based on a key - checking if the key is available
		await OpenPgpEncryptor.initKeys();
		this.isDecryptionAvailable(!OpenPgpEncryptor.findKeysByEmails([this.recipientEmail], false).length <= 0);
	}
};

CFileView.prototype.downloadAndDecryptFile = async function ()
{
	this.isDownloadingAndDecrypting(true);
	await OpenPgpFileProcessor.processFileDecryption(this.fileName, this.fileUrl, this.recipientEmail, this.password(), this.encryptionMode);
	this.isDownloadingAndDecrypting(false);
};

module.exports = CFileView;