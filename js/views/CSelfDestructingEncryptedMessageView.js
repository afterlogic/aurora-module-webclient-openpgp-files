'use strict';

let
	_ = require('underscore'),
	ko = require('knockout'),
	moment = require('moment'),

	ModulesManager = require('%PathToCoreWebclientModule%/js/ModulesManager.js'),
	TextUtils = require('%PathToCoreWebclientModule%/js/utils/Text.js'),
	ErrorsUtils = require('modules/%ModuleName%/js/utils/Errors.js'),
	Screens = require('%PathToCoreWebclientModule%/js/Screens.js'),
	Settings = require('modules/%ModuleName%/js/Settings.js'),

	CAbstractScreenView = require('%PathToCoreWebclientModule%/js/views/CAbstractScreenView.js'),
	OpenPgpEncryptor = ModulesManager.run('OpenPgpWebclient', 'getOpenPgpEncryptor')
;

/**
* @constructor
*/
function CSelfDestructingEncryptedMessageView()
{
	CAbstractScreenView.call(this, '%ModuleName%');

	this.enteredPassword = ko.observable('');
	this.isDecryptionAvailable = ko.observable(false);
	this.isDecrypting = ko.observable(false);
	this.browserTitle = ko.observable(TextUtils.i18n('%MODULENAME%/HEADING_BROWSER_TAB'));
	this.subject = Settings.PublicFileData.Subject ? Settings.PublicFileData.Subject : '';
	this.message = ko.observable('');
	this.data = Settings.PublicFileData.Data ? Settings.PublicFileData.Data : '';
	this.encryptionMode = Settings.PublicFileData.PgpEncryptionMode ? Settings.PublicFileData.PgpEncryptionMode : '';
	this.recipientEmail = Settings.PublicFileData.RecipientEmail ? Settings.PublicFileData.RecipientEmail : '';
	this.ExpireDate = Settings.PublicFileData.ExpireDate ? moment.unix(Settings.PublicFileData.ExpireDate).format("YYYY-MM-DD HH:mm:ss") : '';
	this.ExpireDateMessage = TextUtils.i18n('%MODULENAME%/HINT_MESSAGE_LIFETIME', { 'DATETIME': this.ExpireDate });
	this.EerrorNoKeyMessage = TextUtils.i18n('%MODULENAME%/ERROR_NO_KEY', { 'SYSNAME': Settings.ProductName });
	this.isDecryptedSuccessfully = ko.observable(false);
	this.isShowNoKeyErrorMessage = ko.observable(false);
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

_.extendOwn(CSelfDestructingEncryptedMessageView.prototype, CAbstractScreenView.prototype);

CSelfDestructingEncryptedMessageView.prototype.ViewTemplate = '%ModuleName%_SelfDestructingEncryptedMessageView';
CSelfDestructingEncryptedMessageView.prototype.ViewConstructorName = 'CSelfDestructingEncryptedMessageView';

CSelfDestructingEncryptedMessageView.prototype.onShow = async function ()
{
	if (this.encryptionMode === Enums.EncryptionBasedOn.Key)
	{//if encryption is based on a key - checking if the key is available
		await OpenPgpEncryptor.oPromiseInitialised;
		this.isDecryptionAvailable(!OpenPgpEncryptor.findKeysByEmails([this.recipientEmail], false).length <= 0);
		//show error message if user has no key
		this.isShowNoKeyErrorMessage(!this.isDecryptionAvailable());
	}
};

CSelfDestructingEncryptedMessageView.prototype.decryptMessage = async function ()
{
	if (this.encryptionMode === Enums.EncryptionBasedOn.Password && this.enteredPassword() === '')
	{
		Screens.showError(TextUtils.i18n('%MODULENAME%/ERROR_EMPTY_PASSWORD'));
	}
	else
	{
		this.isDecrypting(true);
		let oDecryptionResult = await OpenPgpEncryptor.decryptData(
			this.data,
			this.enteredPassword(),
			this.encryptionMode === Enums.EncryptionBasedOn.Password
		);
		this.isDecrypting(false);
		if (
			!oDecryptionResult.result
			|| oDecryptionResult.hasErrors()
		)
		{
			ErrorsUtils.showPgpErrorByCode(oDecryptionResult, Enums.PgpAction.DecryptVerify);
		}
		else
		{
			if (oDecryptionResult.hasNotices())
			{
				ErrorsUtils.showPgpErrorByCode(oDecryptionResult, Enums.PgpAction.DecryptVerify);
			}
			this.message(oDecryptionResult.result);
			this.isDecryptedSuccessfully(true);
		}
	}
};

module.exports = CSelfDestructingEncryptedMessageView;