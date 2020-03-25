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
	OpenPgpEncryptor = require('modules/%ModuleName%/js/OpenPgpEncryptor.js'),
	Settings = require('modules/%ModuleName%/js/Settings.js'),
	UserSettings = require('%PathToCoreWebclientModule%/js/Settings.js')
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
	this.recipientAutocompleteItem = ko.observable(null);
	this.recipientAutocomplete = ko.observable('');
	this.keyBasedEncryptionDisabled = ko.observable(true);
	this.passwordBasedEncryptionDisabled = ko.observable(true);
	this.encryptionAvailable = ko.observable(false);
	this.isSuccessfullyEncryptedAndUploaded = ko.observable(false);
	this.keys = ko.observableArray([]);
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
	this.passphraseFile = ko.observable('');
	this.passphraseEmail = ko.observable('');
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
	this.signFileHintText = ko.observable(TextUtils.i18n('%MODULENAME%/HINT_NOT_SIGN_FILE'));
	this.signEmailHintText = ko.observable(TextUtils.i18n('%MODULENAME%/HINT_NOT_SIGN_EMAIL'));
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
	this.sign.subscribe(bSign => {
		if (bSign)
		{
			this.signFileHintText(TextUtils.i18n('%MODULENAME%/HINT_SIGN_FILE'));
			this.signEmailHintText(TextUtils.i18n('%MODULENAME%/HINT_SIGN_EMAIL'));
		}
		else
		{
			this.signFileHintText(TextUtils.i18n('%MODULENAME%/HINT_NOT_SIGN_FILE'));
			this.signEmailHintText(TextUtils.i18n('%MODULENAME%/HINT_NOT_SIGN_EMAIL'));
		}
	});
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

SelfDestructingEncryptedMessagePopup.prototype.onOpen = async function (sSubject, sPlainText, sRecipientEmail, sFromEmail)
{
	this.sSubject = sSubject;
	this.sPlainText = sPlainText;
	this.sRecipientEmail = sRecipientEmail;
	this.sFromEmail = sFromEmail;
	await OpenPgpEncryptor.initKeys();
	this.keys(OpenPgpEncryptor.getKeys());
	const aPrivateKeys = OpenPgpEncryptor.findKeysByEmails([this.sFromEmail], false);
	if (aPrivateKeys.length > 0)
	{
		this.isPrivateKeyAvailable(true);
	}
	else
	{
		this.isPrivateKeyAvailable(false);
	}
	if (sRecipientEmail)
	{
		let aKeys = OpenPgpEncryptor.getPublicKeysIfExistsByEmail(sRecipientEmail);
		let oRecipient = null;
		if (aKeys && aKeys[0])
		{
			oRecipient = {
				label: aKeys[0].getUser(),
				value: aKeys[0].getUser(),
				name: aKeys[0].getUser(),
				email: aKeys[0].getEmail(),
				frequency: 0,
				id: 0,
				team: false,
				sharedToAll: false,
				hasKey: true
			};
		}
		else
		{
			oRecipient = {
				label: sRecipientEmail,
				value: sRecipientEmail,
				name: sRecipientEmail,
				email: sRecipientEmail,
				frequency: 0,
				id: 0,
				team: false,
				sharedToAll: false,
				hasKey: false
			};
		}
		this.recipientAutocompleteItem(oRecipient);
		this.recipientAutocomplete(oRecipient.value);
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
	this.passphraseFile('');
	this.passphraseEmail('');
	this.sign(false);
	this.password('');
};

SelfDestructingEncryptedMessagePopup.prototype.encrypt = async function ()
{
	this.isEncrypting(true);
	const OpenPgpResult = await OpenPgpEncryptor.encryptData(
		this.sPlainText,
		this.recipientAutocompleteItem().email,
		this.encryptionBasedMode() === Enums.EncryptionBasedOn.Password,
		this.sign(),
		this.passphraseEmail(),
		this.sFromEmail
	);

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
				if (password)
				{
					sBody = TextUtils.i18n('%MODULENAME%/SELF_DESTRUCT_LINK_MESSAGE_BODY_WITH_PASSWORD',
						{
							'URL': sFullLink,
							'BR': '\r\n',
							'PASSWORD': password,
							'EMAIL': App.currentAccountEmail ? App.currentAccountEmail() : '',
							'HOURS': this.selectedLifetimeHrs(),
							'CREATING_TIME_GMT': sCurrentTime
						}
					);
				}
				else
				{
					sBody = TextUtils.i18n('%MODULENAME%/SELF_DESTRUCT_LINK_MESSAGE_BODY',
						{
							'URL': sFullLink,
							'BR': '\r\n',
							'EMAIL': App.currentAccountEmail ? App.currentAccountEmail() : '',
							'HOURS': this.selectedLifetimeHrs(),
							'CREATING_TIME_GMT': sCurrentTime
						}
					);
				}
				const OpenPgpResult = await OpenPgpEncryptor.encryptMessage(sBody, this.recipientAutocompleteItem().email, this.sign(), this.passphraseEmail(), this.sFromEmail);
				if (OpenPgpResult && OpenPgpResult.result && !OpenPgpResult.hasErrors())
				{
					const sEncryptedBody = OpenPgpResult.result;
					this.composeMessageWithData({
						to: this.recipientAutocompleteItem().value,
						subject: sSubject,
						body: sEncryptedBody,
						isHtml: false
					});
					this.cancelPopup();
				}
				else
				{
					ErrorsUtils.showPgpErrorByCode(OpenPgpResult, Enums.PgpAction.Encrypt);
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
					this.showPassword(password);
					this.composeMessageWithData({
						to: this.recipientAutocompleteItem().value,
						subject: sSubject,
						body: sBody,
						isHtml: true
					});
				}
			}
		}
		else
		{
			Screens.showError(TextUtils.i18n('%MODULENAME%/ERROR_CREATE_PUBLIC_LINK'));
		}	
	}
	else
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
	const fAutocompleteCallback = ModulesManager.run('ContactsWebclient',
		'getSuggestionsAutocompleteCallback',
		['all', App.getUserPublicId(), /*bWithGroups*/ false]
	);
	const fMarkRecipientsWithKeyCallback = (aRecipienstList) => {
		let aPublicKeysEmails = this.getPublicKeysEmails();
		let iOwnPublicKeyIndex = aPublicKeysEmails.indexOf(App.getUserPublicId());
		if (iOwnPublicKeyIndex > -1)
		{//remove own public key from list
			aPublicKeysEmails.splice(iOwnPublicKeyIndex, 1);
		}
		aRecipienstList.forEach(oRecipient => {
			const iIndex = aPublicKeysEmails.indexOf(oRecipient.email);
			if (iIndex > -1)
			{
				oRecipient.hasKey = true;
				//remove key from list when recipient is marked
				aPublicKeysEmails.splice(iIndex, 1);
			}
			else
			{
				oRecipient.hasKey = false;
			}
		});
		aPublicKeysEmails.forEach(sPublicKey => {
			let aKeys = OpenPgpEncryptor.getPublicKeysIfExistsByEmail(sPublicKey);
			if (aKeys && aKeys[0])
			{
				aRecipienstList.push(
					{
						label: aKeys[0].getUser(),
						value: aKeys[0].getUser(),
						name: aKeys[0].getUser(),
						email: aKeys[0].getEmail(),
						frequency: 0,
						id: 0,
						team: false,
						sharedToAll: false,
						hasKey: true
					}
				);
			}
		});
		fResponse(aRecipienstList);
	};
	if (_.isFunction(fAutocompleteCallback))
	{
		this.recipientAutocompleteItem(null);
		fAutocompleteCallback(oRequest, fMarkRecipientsWithKeyCallback);
	}
};

SelfDestructingEncryptedMessagePopup.prototype.getPublicKeysEmails = function ()
{
	let aPublicKeys = this.keys().filter(oKey => oKey.isPublic());

	return aPublicKeys.map(oKey => oKey.getEmail());
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

SelfDestructingEncryptedMessagePopup.prototype.showPassword = function (sPassword)
{
	this.password(sPassword);
};

module.exports = new SelfDestructingEncryptedMessagePopup();
