'use strict';

let
	_ = require('underscore'),
	ko = require('knockout'),

	TextUtils = require('%PathToCoreWebclientModule%/js/utils/Text.js'),
	Screens = require('%PathToCoreWebclientModule%/js/Screens.js'),
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
	this.isDecryptionAvailable = ko.observable(false);
	this.isDownloadingAndDecrypting = ko.observable(false);
	this.browserTitle = ko.observable(TextUtils.i18n('%MODULENAME%/HEADING_BROWSER_TAB'));
	this.fileName = Settings.PublicFileData.Name ? Settings.PublicFileData.Name : '';
	this.fileSize = Settings.PublicFileData.Size ? Settings.PublicFileData.Size : '';
	this.fileUrl = Settings.PublicFileData.Url ? Settings.PublicFileData.Url : '';
	this.encryptionMode = Settings.PublicFileData.PgpEncryptionMode ? Settings.PublicFileData.PgpEncryptionMode : '';
	this.recipientEmail = Settings.PublicFileData.PgpEncryptionRecipientEmail ? Settings.PublicFileData.PgpEncryptionRecipientEmail : '';
	this.bSecuredLink = !!Settings.PublicFileData.IsSecuredLink;
	if (this.bSecuredLink)
	{
		this.passwordLabel = TextUtils.i18n('%MODULENAME%/LABEL_ENTER_PASSWORD');
	}
	else
	{
		switch (this.encryptionMode)
		{
			case Enums.EncryptionBasedOn.Key:
				this.passwordLabel = TextUtils.i18n('%MODULENAME%/LABEL_ENTER_PASSPHRASE', {'KEY': this.recipientEmail});
				this.isDecryptionAvailable(true);
				break;
			case Enums.EncryptionBasedOn.Password:
				this.passwordLabel = TextUtils.i18n('%MODULENAME%/LABEL_ENTER_PASSWORD');
				this.isDecryptionAvailable(true);
				break;
			default:
				//Encryption mode not defined
				this.passwordLabel = "";
		}
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
	if (this.encryptionMode === Enums.EncryptionBasedOn.Password && this.password() === '')
	{
		Screens.showError(TextUtils.i18n('%MODULENAME%/ERROR_EMPTY_PASSWORD'));
	}
	else
	{
		this.isDownloadingAndDecrypting(true);
		await OpenPgpFileProcessor.processFileDecryption(this.fileName, this.fileUrl, this.recipientEmail, this.password(), this.encryptionMode);
		this.isDownloadingAndDecrypting(false);
	}
};

CFileView.prototype.securedLinkDownload = function ()
{
	if (this.password() === '')
	{
		Screens.showError(TextUtils.i18n('%MODULENAME%/ERROR_EMPTY_PASSWORD'));
	}
	else
	{
		window.location.href = this.fileUrl + '/download/secure/' + encodeURIComponent(this.password());
	}
};

module.exports = CFileView;