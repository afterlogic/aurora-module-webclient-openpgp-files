'use strict';

let
	_ = require('underscore'),
	ko = require('knockout'),
	moment = require('moment'),

	App = require('%PathToCoreWebclientModule%/js/App.js'),
	ModulesManager = require('%PathToCoreWebclientModule%/js/ModulesManager.js'),
	TextUtils = require('%PathToCoreWebclientModule%/js/utils/Text.js'),
	UrlUtils = require('%PathToCoreWebclientModule%/js/utils/Url.js'),
	Screens = require('%PathToCoreWebclientModule%/js/Screens.js'),
	CAbstractPopup = require('%PathToCoreWebclientModule%/js/popups/CAbstractPopup.js'),
	ErrorsUtils = require('modules/%ModuleName%/js/utils/Errors.js'),
	Ajax = require('%PathToCoreWebclientModule%/js/Ajax.js'),
	Settings = require('modules/%ModuleName%/js/Settings.js'),
	UserSettings = require('%PathToCoreWebclientModule%/js/Settings.js'),
	OpenPgpEncryptor = ModulesManager.run('OpenPgpWebclient', 'getOpenPgpEncryptor')
;
/**
 * @constructor
 */
function SelfDestructingEncryptedMessagePopup()
{
	CAbstractPopup.call(this);

	this.sSubject = null;
	this.sPlainText = null;
	this.sRecipientEmail = null;
	this.sFromEmail = null;
	this.sSelectedSenderId = null;
	this.recipientAutocompleteItem = ko.observable(null);
	this.recipientAutocomplete = ko.observable('');
	this.keyBasedEncryptionDisabled = ko.observable(true);
	this.passwordBasedEncryptionDisabled = ko.observable(true);
	this.encryptionAvailable = ko.observable(false);
	this.isSuccessfullyEncryptedAndUploaded = ko.observable(false);
	this.encryptionBasedMode = ko.observable('');
	this.recipientHintText = ko.observable(TextUtils.i18n('%MODULENAME%/HINT_SELECT_RECIPIENT'));
	this.encryptionModeHintText = ko.observable('');
	this.isEncrypting = ko.observable(false);
	this.encryptedFileLink = ko.observable('');
	this.encryptedFilePassword = ko.observable('');
	this.sendButtonText = ko.observable('');
	this.hintUnderEncryptionInfo = ko.observable('');
	this.sign = ko.observable(false);
	this.isSigningAvailable = ko.observable(false);
	this.isPrivateKeyAvailable = ko.observable(false);
	this.passphrase = ko.observable('');
	this.password = ko.observable('');
	this.selectedLifetimeHrs = ko.observable(null);
	this.lifetime = ko.observableArray([
		{
			label: "24 " + TextUtils.i18n('%MODULENAME%/OPTION_LIFE_TIME_HOURS'),
			value: 24
		},
		{
			label: "72 " + TextUtils.i18n('%MODULENAME%/OPTION_LIFE_TIME_HOURS'),
			value: 72
		},
		{
			label: "7 " + TextUtils.i18n('%MODULENAME%/OPTION_LIFE_TIME_DAYS'),
			value: 7 * 24
		}
	]);
	this.composeMessageWithData = ModulesManager.run('MailWebclient', 'getComposeMessageWithData');
	this.cancelButtonText = ko.computed(() => {
		return this.isSuccessfullyEncryptedAndUploaded() ?
			TextUtils.i18n('COREWEBCLIENT/ACTION_CLOSE') :
			TextUtils.i18n('COREWEBCLIENT/ACTION_CANCEL');
	});
	this.recipientAutocomplete.subscribe(sItem => {
		if (sItem === '')
		{
			this.recipientAutocompleteItem(null);
		}
	}, this);
	this.recipientAutocompleteItem.subscribe(oItem => {
		if (oItem)
		{
			//password-based encryption is available after selecting the recipient
			this.passwordBasedEncryptionDisabled(false);
			this.encryptionBasedMode(Enums.EncryptionBasedOn.Password);
			this.encryptionAvailable(true);
			if (oItem.hasKey)
			{
				//key-based encryption available if we have recipients public key
				this.keyBasedEncryptionDisabled(false);
				this.recipientHintText(TextUtils.i18n('%MODULENAME%/HINT_SELF_DESTRUCT_LINK_KEY_RECIPIENT'));
			}
			else
			{
				this.keyBasedEncryptionDisabled(true);
				this.recipientHintText(TextUtils.i18n('%MODULENAME%/HINT_NO_KEY_RECIPIENT'));
			}
		}
		else
		{
			this.keyBasedEncryptionDisabled(true);
			this.passwordBasedEncryptionDisabled(true);
			this.encryptionAvailable(false);
			this.encryptionBasedMode('');
			this.recipientHintText(TextUtils.i18n('%MODULENAME%/HINT_SELECT_RECIPIENT'));
		}
	}, this);
	this.encryptionBasedMode.subscribe(oItem => {
		switch (oItem)
		{
			case Enums.EncryptionBasedOn.Password:
				this.encryptionModeHintText(TextUtils.i18n('%MODULENAME%/HINT_PASSWORD_BASED_ENCRYPTION'));
				//Signing is unavailable for file encrypted with password
				this.isSigningAvailable(false);
				this.sign(false);
				break;
			case Enums.EncryptionBasedOn.Key:
				this.encryptionModeHintText(TextUtils.i18n('%MODULENAME%/HINT_KEY_BASED_ENCRYPTION'));
				if (this.isPrivateKeyAvailable())
				{
					//Signing is available for file encrypted with key and with available Private Key
					this.isSigningAvailable(true);
					this.sign(true);
				}
				break;
			default:
				this.encryptionModeHintText('');
				this.isSigningAvailable(false);
				this.sign(true);
		}
	});
	this.signEmailHintText = ko.computed(function () {
		if (this.sign())
		{
			return TextUtils.i18n('%MODULENAME%/HINT_SIGN_EMAIL');
		}
		return TextUtils.i18n('%MODULENAME%/HINT_NOT_SIGN_EMAIL');
	}, this);
	this.signFileHintText = ko.computed(function () {
		if (this.sign())
		{
			return TextUtils.i18n('%MODULENAME%/HINT_SIGN_FILE');
		}
		if (this.encryptionBasedMode() !== Enums.EncryptionBasedOn.Key)
		{
			return TextUtils.i18n('%MODULENAME%/HINT_NOT_SIGN_FILE_REQUIRES_KEYBASED_ENCRYPTION');
		}
		if (!this.isSigningAvailable())
		{
			return TextUtils.i18n('%MODULENAME%/HINT_NOT_SIGN_FILE_REQUIRES_PRIVATE_KEY');
		}
		return TextUtils.i18n('%MODULENAME%/HINT_NOT_SIGN_FILE');
	}, this);
	this.isEncrypting.subscribe(bEncrypting => {
		//UI elements become disabled when encryption started
		if (bEncrypting)
		{
			this.keyBasedEncryptionDisabled(true);
			this.passwordBasedEncryptionDisabled(true);
		}
		else
		{
			this.keyBasedEncryptionDisabled(false);
			this.passwordBasedEncryptionDisabled(false);
		}
	});
}

_.extendOwn(SelfDestructingEncryptedMessagePopup.prototype, CAbstractPopup.prototype);

SelfDestructingEncryptedMessagePopup.prototype.PopupTemplate = '%ModuleName%_SelfDestructingEncryptedMessagePopup';

SelfDestructingEncryptedMessagePopup.prototype.onOpen = async function (sSubject, sPlainText, recipientInfo, sFromEmail, sSelectedSenderId)
{
	this.sSubject = sSubject;
	this.sPlainText = sPlainText;
	this.sRecipientEmail = '';
	this.sFromEmail = sFromEmail;
	this.sSelectedSenderId = sSelectedSenderId;

	if (recipientInfo) {
		this.sRecipientEmail = recipientInfo.email;
		this.recipientAutocompleteItem(recipientInfo);
		this.recipientAutocomplete(recipientInfo.value);
	}

	await OpenPgpEncryptor.oPromiseInitialised;
	const aPrivateKeys = OpenPgpEncryptor.findKeysByEmails([this.sFromEmail], false);
	if (aPrivateKeys.length > 0) {
		this.isPrivateKeyAvailable(true);
	} else {
		this.isPrivateKeyAvailable(false);
	}
};

SelfDestructingEncryptedMessagePopup.prototype.cancelPopup = function ()
{
	this.clearPopup();
	this.closePopup();
};

SelfDestructingEncryptedMessagePopup.prototype.clearPopup = function ()
{
	this.sPlainText = null;
	this.sRecipientEmail = null;
	this.sFromEmail = null;
	this.recipientAutocompleteItem(null);
	this.recipientAutocomplete('');
	this.isSuccessfullyEncryptedAndUploaded(false);
	this.encryptedFileLink('');
	this.encryptedFilePassword('');
	this.passphrase('');
	this.sign(false);
	this.password('');
};

SelfDestructingEncryptedMessagePopup.prototype.encrypt = async function ()
{
	this.isEncrypting(true);

	const
		aEmailForEncrypt = OpenPgpEncryptor.findKeysByEmails([this.sFromEmail], true).length > 0
			? [this.recipientAutocompleteItem().email, this.sFromEmail]
			: [this.recipientAutocompleteItem().email],
		contactsUUIDs = [this.recipientAutocompleteItem().uuid],
		aPublicKeys = await OpenPgpEncryptor.getPublicKeysByContactsAndEmails(contactsUUIDs, aEmailForEncrypt),
		aPrivateKeys = OpenPgpEncryptor.findKeysByEmails([this.sFromEmail], false),
		isPasswordBasedEncryption = this.encryptionBasedMode() === Enums.EncryptionBasedOn.Password,
		OpenPgpResult = await OpenPgpEncryptor.encryptData(this.sPlainText, aPublicKeys, aPrivateKeys,
			isPasswordBasedEncryption, this.sign()
		)
	;

	if (OpenPgpResult.passphrase)
	{
		// saving passphrase so that it won't be asked again until "self-destructing secure email" popup is closed
		this.passphrase(OpenPgpResult.passphrase);
	}
	
	if (OpenPgpResult && OpenPgpResult.result && !OpenPgpResult.hasErrors())
	{
		let {data, password} = OpenPgpResult.result;
		//create link
		let oCreateLinkResult = await this.createSelfDestrucPublicLink(
			this.sSubject, data,
			this.recipientAutocompleteItem().email,
			this.encryptionBasedMode(),
			this.selectedLifetimeHrs()
		);
		if (oCreateLinkResult.result && oCreateLinkResult.link)
		{
			const sFullLink = UrlUtils.getAppPath() + oCreateLinkResult.link + '#' + Settings.SelfDestructMessageHash;
			//compose message
			const sSubject = TextUtils.i18n('%MODULENAME%/SELF_DESTRUCT_LINK_MESSAGE_SUBJECT');
			let sBody = "";
			let sBrowserTimezone = moment.tz.guess();
			let sServerTimezone = UserSettings.timezone();
			let sCurrentTime = moment.tz(new Date(), sBrowserTimezone || sServerTimezone).format('MMM D, YYYY HH:mm [GMT] ZZ');

			if (this.recipientAutocompleteItem().hasKey)
			{//encrypt message with key
				let sMessage = password
					? '%MODULENAME%/SELF_DESTRUCT_LINK_MESSAGE_BODY_WITH_PASSWORD'
					: '%MODULENAME%/SELF_DESTRUCT_LINK_MESSAGE_BODY';
				let oOptions = {
					'URL': sFullLink,
					'BR': '\r\n',
					'EMAIL': App.currentAccountEmail ? App.currentAccountEmail() : '',
					'HOURS': this.selectedLifetimeHrs(),
					'CREATING_TIME_GMT': sCurrentTime
				};
				if (password)
				{
					oOptions.PASSWORD = password;
				}
				sBody = TextUtils.i18n(sMessage, oOptions);

				const
					contactEmail = this.recipientAutocompleteItem().email,
					contactUUID = this.recipientAutocompleteItem().uuid,
					encryptResult = await OpenPgpEncryptor.encryptMessage(sBody, contactEmail,
						this.sign(), this.passphrase(), this.sFromEmail, contactUUID
					)
				;
				if (encryptResult && encryptResult.result && !encryptResult.hasErrors())
				{
					const sEncryptedBody = encryptResult.result;
					this.composeMessageWithData({
						to: this.recipientAutocompleteItem().value,
						subject: sSubject,
						body: sEncryptedBody,
						isHtml: false,
						selectedSenderId: this.sSelectedSenderId
					});
					this.cancelPopup();
				}
				else
				{
					ErrorsUtils.showPgpErrorByCode(encryptResult, Enums.PgpAction.Encrypt);
				}
			}
			else
			{
				//send not encrypted message
				//if the recipient does not have a key, the message can only be encrypted with a password
				if (password)
				{
					sBody = TextUtils.i18n('%MODULENAME%/SELF_DESTRUCT_LINK_MESSAGE_BODY_NOT_ENCRYPTED',
						{
							'URL': sFullLink,
							'EMAIL': App.currentAccountEmail ? App.currentAccountEmail() : '',
							'BR': '<br>',
							'HOURS': this.selectedLifetimeHrs(),
							'CREATING_TIME_GMT': sCurrentTime
						}
					);
					this.password(password);
					this.composeMessageWithData({
						to: this.recipientAutocompleteItem().value,
						subject: sSubject,
						body: sBody,
						isHtml: true,
						selectedSenderId: this.sSelectedSenderId
					});
				}
				else
				{
					Screens.showError(TextUtils.i18n('%MODULENAME%/ERROR_CREATE_PUBLIC_LINK'));
				}
			}
		}
		else
		{
			Screens.showError(TextUtils.i18n('%MODULENAME%/ERROR_CREATE_PUBLIC_LINK'));
		}
	}
	else if (!OpenPgpResult || !OpenPgpResult.userCanceled)
	{
		ErrorsUtils.showPgpErrorByCode(OpenPgpResult, Enums.PgpAction.Encrypt);
	}
	this.isEncrypting(false);
};

/**
 * @param {object} oRequest
 * @param {function} fResponse
 */
SelfDestructingEncryptedMessagePopup.prototype.autocompleteCallback = function (oRequest, fResponse)
{
	const
		suggestParameters = {
			storage: 'all',
			addContactGroups: false,
			addUserGroups: false,
			exceptEmail: App.getUserPublicId()
		},
		autocompleteCallback = ModulesManager.run(
			'ContactsWebclient', 'getSuggestionsAutocompleteCallback', [suggestParameters]
		)
	;

	if (_.isFunction(autocompleteCallback)) {
		this.recipientAutocompleteItem(null);
		autocompleteCallback(oRequest, fResponse);
	}
};

SelfDestructingEncryptedMessagePopup.prototype.createSelfDestrucPublicLink = async function (sSubject, sData, sRecipientEmail, sEncryptionBasedMode, iLifetimeHrs)
{
	let sLink = '';
	let oResult = {result: false};

	const oPromiseCreateSelfDestrucPublicLink = new Promise( (resolve, reject) => {
		const fResponseCallback = (oResponse, oRequest) => {
			if (oResponse.Result && oResponse.Result.link)
			{
				resolve(oResponse.Result.link);
			}
			reject(new Error(TextUtils.i18n('%MODULENAME%/ERROR_PUBLIC_LINK_CREATION')));
		};
		let oParams = {
			'Subject': sSubject,
			'Data': sData,
			'RecipientEmail': sRecipientEmail,
			'PgpEncryptionMode': sEncryptionBasedMode,
			'LifetimeHrs': iLifetimeHrs
		};

		Ajax.send(
			'OpenPgpFilesWebclient',
			'CreateSelfDestrucPublicLink',
			oParams,
			fResponseCallback,
			this
		);
	});
	try
	{
		sLink = await oPromiseCreateSelfDestrucPublicLink;
		oResult.result = true;
		oResult.link = sLink;
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

module.exports = new SelfDestructingEncryptedMessagePopup();
