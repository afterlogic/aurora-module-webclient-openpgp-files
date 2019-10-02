'use strict';

let
	_ = require('underscore'),
	ko = require('knockout'),

	App = require('%PathToCoreWebclientModule%/js/App.js'),
	ModulesManager = require('%PathToCoreWebclientModule%/js/ModulesManager.js'),
	TextUtils = require('%PathToCoreWebclientModule%/js/utils/Text.js'),
	CAbstractPopup = require('%PathToCoreWebclientModule%/js/popups/CAbstractPopup.js'),
	ErrorsUtils = require('modules/%ModuleName%/js/utils/Errors.js'),
	OpenPgpEncryptor = require('modules/%ModuleName%/js/OpenPgpEncryptor.js')
;
/**
 * @constructor
 */
function EncryptFilePopup()
{
	CAbstractPopup.call(this);

	this.sPassword = ko.observable('');
	this.fOnKeyOrPasswordSelectedCallback = null;
	this.fOnCancellCallback = null;
	this.recipientAutocompleteItem = ko.observable(null);
	this.recipientAutocomplete = ko.observable('');
	this.keyBasedEncryptionDisabled = ko.observable(true);
	this.passwordBasedEncryptionDisabled = ko.observable(true);
	this.encryptionAvailable = ko.observable(false);
	this.isSuccessfullyEncryptedAndUploaded = ko.observable(false);
	this.keys = ko.observableArray([]);
	this.encryptionBasedMode = ko.observable('');
	this.recipientHintText = ko.observable(TextUtils.i18n('%MODULENAME%/HINT_SELECT_RECIPIENT'));
	this.isEncrypting = ko.observable(false);
	this.encryptedFileLink = ko.observable('');
	this.encryptedFilePassword = ko.observable('');
	this.sendButtonText = ko.observable('');
	this.hintUnderEncryptionInfo = ko.observable('');
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
			this.passwordBasedEncryptionDisabled(false);
			this.encryptionBasedMode(Enums.EncryptionBasedOn.Password);
			this.encryptionAvailable(true);
			if (oItem.hasKey)
			{
				this.keyBasedEncryptionDisabled(false);
				this.recipientHintText(TextUtils.i18n('%MODULENAME%/HINT_KEY_RECIPIENT'));
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
	this.publicKeys = ko.computed(() => {
		let aPublicKeys = this.keys().filter(oKey => oKey.isPublic());
		return aPublicKeys.map(oKey => oKey.getEmail());
	}, this);
}

_.extendOwn(EncryptFilePopup.prototype, CAbstractPopup.prototype);

EncryptFilePopup.prototype.PopupTemplate = '%ModuleName%_EncryptFilePopup';

EncryptFilePopup.prototype.onOpen = async function (fOnKeyOrPasswordSelectedCallback, fOnCancellCallback)
{
	this.fOnKeyOrPasswordSelectedCallback = fOnKeyOrPasswordSelectedCallback;
	this.fOnCancellCallback = fOnCancellCallback;
	await OpenPgpEncryptor.initKeys();
	this.keys(OpenPgpEncryptor.getKeys());
};

EncryptFilePopup.prototype.cancelPopup = function ()
{
	if (_.isFunction(this.fOnCancellCallback))
	{
		this.fOnCancellCallback();
	}
	this.clearPopup();
	this.closePopup();
};

EncryptFilePopup.prototype.clearPopup = function ()
{
	this.recipientAutocompleteItem(null);
	this.recipientAutocomplete('');
	this.isSuccessfullyEncryptedAndUploaded(false);
	this.encryptedFileLink('');
	this.encryptedFilePassword('');
};

EncryptFilePopup.prototype.encrypt = async function ()
{
	this.isEncrypting(true);
	if (_.isFunction(this.fOnKeyOrPasswordSelectedCallback))
	{
		this.fOnKeyOrPasswordSelectedCallback(this.recipientAutocompleteItem().email, this.encryptionBasedMode() === Enums.EncryptionBasedOn.Password);
	}
};

/**
 * @param {object} oRequest
 * @param {function} fResponse
 */
EncryptFilePopup.prototype.autocompleteCallback = function (oRequest, fResponse)
{
	const fAutocompleteCallback = ModulesManager.run('ContactsWebclient',
		'getSuggestionsAutocompleteCallback',
		['all', App.getUserPublicId(), /*bWithGroups*/ false]
	);
	const fMarkRecepientsWithKeyCallback = (aRecipienstList) => {
		let aPublicKeys = this.publicKeys();
		aRecipienstList.forEach(oRecipient => {
			if (aPublicKeys.indexOf(oRecipient.email) !== -1)
			{
				oRecipient.hasKey = true;
			}
			else
			{
				oRecipient.hasKey = false;
			}
		});
		fResponse(aRecipienstList);
	};
	if (_.isFunction(fAutocompleteCallback))
	{
		this.recipientAutocompleteItem(null);
		fAutocompleteCallback(oRequest, fMarkRecepientsWithKeyCallback);
	}
};

EncryptFilePopup.prototype.showResults = function (oData)
{
	const {result, password, link} = oData;
	if (result)
	{
		if (this.recipientAutocompleteItem().hasKey)
		{
			this.sendButtonText(TextUtils.i18n('%MODULENAME%/ACTION_SEND_ENCRYPTED_EMAIL'));
			if (this.encryptionBasedMode() === Enums.EncryptionBasedOn.Password)
			{
				this.hintUnderEncryptionInfo(TextUtils.i18n('%MODULENAME%/HINT_STORE_PASSWORD'));
			}
			else
			{
				const sUserName = this.recipientAutocompleteItem().name ? this.recipientAutocompleteItem().name : this.recipientAutocompleteItem().emaill;
				this.hintUnderEncryptionInfo(TextUtils.i18n('%MODULENAME%/HINT_ENCRYPTED_EMAIL', {'USER': sUserName}));
			}
		}
		else
		{
			this.sendButtonText(TextUtils.i18n('%MODULENAME%/ACTION_SEND_EMAIL'));
			this.hintUnderEncryptionInfo(TextUtils.i18n('%MODULENAME%/HINT_EMAIL'));
		}
		this.isSuccessfullyEncryptedAndUploaded(true);
		this.encryptedFileLink(link);
		this.encryptedFilePassword(password);
	}
	this.isEncrypting(false);

};

EncryptFilePopup.prototype.sendEmail = async function ()
{
	const sSubject = TextUtils.i18n('%MODULENAME%/MESSAGE_SUBJECT');

	if (this.recipientAutocompleteItem().hasKey)
	{//message is encrypted
		let sBody = '';
		if (this.encryptionBasedMode() === Enums.EncryptionBasedOn.Password)
		{
			sBody = TextUtils.i18n('%MODULENAME%/ENCRYPTED_WITH_PASSWORD_MESSAGE_BODY',
				{
					'URL': this.encryptedFileLink(),
					'PASSWORD': this.encryptedFilePassword(),
					'BR': '\r\n'
				}
			);
		}
		else
		{
			const sUserName = this.recipientAutocompleteItem().name ? this.recipientAutocompleteItem().name : this.recipientAutocompleteItem().emaill;
			sBody = TextUtils.i18n('%MODULENAME%/ENCRYPTED_WITH_KEY_MESSAGE_BODY',
				{
					'URL': this.encryptedFileLink(),
					'USER': sUserName,
					'BR': '\r\n'
				}
			);
		}
		const OpenPgpResult = await OpenPgpEncryptor.encryptMessage(sBody, this.recipientAutocompleteItem().email);

		if (OpenPgpResult && OpenPgpResult.result)
		{
			const sEncryptedBody = OpenPgpResult.result;
			this.composeMessageWithData({
				to: this.recipientAutocompleteItem().value,
				subject: sSubject,
				body: sEncryptedBody,
				isHtml: false
			});
			this.clearPopup();
			this.closePopup();
		}
		else
		{
			ErrorsUtils.showPgpErrorByCode(OpenPgpResult, Enums.PgpAction.Encrypt);
		}
	}
	else
	{//message is not encrypted
		const sBody = TextUtils.i18n('%MODULENAME%/MESSAGE_BODY', {'URL': this.encryptedFileLink()});
			this.composeMessageWithData({
				to: this.recipientAutocompleteItem().value,
				subject: sSubject,
				body: sBody,
				isHtml: true
			});
		this.clearPopup();
		this.closePopup();
	}
};

module.exports = new EncryptFilePopup();
