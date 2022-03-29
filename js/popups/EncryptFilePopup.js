'use strict';

let
	_ = require('underscore'),
	ko = require('knockout'),

	App = require('%PathToCoreWebclientModule%/js/App.js'),
	ModulesManager = require('%PathToCoreWebclientModule%/js/ModulesManager.js'),
	TextUtils = require('%PathToCoreWebclientModule%/js/utils/Text.js'),
	UrlUtils = require('%PathToCoreWebclientModule%/js/utils/Url.js'),
	CAbstractPopup = require('%PathToCoreWebclientModule%/js/popups/CAbstractPopup.js'),
	ErrorsUtils = require('modules/%ModuleName%/js/utils/Errors.js'),
	OpenPgpFileProcessor = require('modules/%ModuleName%/js/OpenPgpFileProcessor.js'),
	Settings = require('modules/%ModuleName%/js/Settings.js'),
	OpenPgpEncryptor = ModulesManager.run('OpenPgpWebclient', 'getOpenPgpEncryptor')
;
/**
 * @constructor
 */
function EncryptFilePopup()
{
	CAbstractPopup.call(this);

	this.oFile = null;
	this.oFilesView = null;
	this.recipientAutocompleteItem = ko.observable(null);
	this.recipientAutocomplete = ko.observable('');
	this.keyBasedEncryptionDisabled = ko.observable(true);
	this.isSuccessfullyEncryptedAndUploaded = ko.observable(false);
	this.keys = ko.observableArray([]);
	this.encryptionBasedMode = ko.observable(Enums.EncryptionBasedOn.Password);
	this.recipientHintText = ko.observable(TextUtils.i18n('%MODULENAME%/HINT_ONLY_PASSWORD_BASED'));
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
	this.composeMessageWithData = ModulesManager.run('MailWebclient', 'getComposeMessageWithData');
	this.sUserEmail = '';
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
			this.recipientAutocomplete(oItem.value);
			this.encryptionBasedMode(Enums.EncryptionBasedOn.Password);
			if (oItem.hasKey)
			{
				//key-based encryption available if we have recipients public key
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
			this.encryptionBasedMode(Enums.EncryptionBasedOn.Password);
			this.recipientHintText(TextUtils.i18n('%MODULENAME%/HINT_ONLY_PASSWORD_BASED'));
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
	this.addButtons = ko.observableArray([]);
}

_.extendOwn(EncryptFilePopup.prototype, CAbstractPopup.prototype);

EncryptFilePopup.prototype.PopupTemplate = '%ModuleName%_EncryptFilePopup';

EncryptFilePopup.prototype.onOpen = async function (oFile, oFilesView)
{
	this.addButtons([]);
	this.oFile = oFile;
	this.oFilesView = oFilesView;
	await OpenPgpEncryptor.oPromiseInitialised;
	this.keys(OpenPgpEncryptor.getKeys());
	this.sUserEmail = App.currentAccountEmail ? App.currentAccountEmail() : '';
	const aPrivateKeys = OpenPgpEncryptor.findKeysByEmails([this.sUserEmail], false);
	if (aPrivateKeys.length > 0)
	{
		this.isPrivateKeyAvailable(true);
	}
	else
	{
		this.isPrivateKeyAvailable(false);
	}
};

EncryptFilePopup.prototype.cancelPopup = function ()
{
	this.clearPopup();
	this.closePopup();
};

EncryptFilePopup.prototype.clearPopup = function ()
{
	this.oFile = null;
	this.oFilesView = null;
	this.recipientAutocompleteItem(null);
	this.recipientAutocomplete('');
	this.isSuccessfullyEncryptedAndUploaded(false);
	this.encryptedFileLink('');
	this.encryptedFilePassword('');
	this.passphrase('');
	this.sign(false);
	this.sUserEmail = '';
};

EncryptFilePopup.prototype.encrypt = async function ()
{
	this.isEncrypting(true);
	let oResult = await OpenPgpFileProcessor.processFileEncryption(
		this.oFile,
		this.oFilesView,
		this.recipientAutocompleteItem() ? this.recipientAutocompleteItem().email : '',
		this.encryptionBasedMode() === Enums.EncryptionBasedOn.Password,
		this.sign(),
		''
	);
	this.isEncrypting(false);
	if (this.sign() && oResult.result && oResult.passphrase)
	{
		// saving passphrase so that it won't be asked again until encrypt popup is closed
		this.passphrase(oResult.passphrase);
	}
	this.showResults(oResult);
};

/**
 * @param {object} oRequest
 * @param {function} fResponse
 */
EncryptFilePopup.prototype.autocompleteCallback = function (oRequest, fResponse)
{
	if (!this.oFile) {
		fResponse([]);
		return;
	}

	const
		suggestParameters = {
			storage: 'all',
			addContactGroups: false,
			addUserGroups: false,
			exceptEmail: this.oFile.sOwnerName
		},
		autocompleteCallback = ModulesManager.run(
			'ContactsWebclient', 'getSuggestionsAutocompleteCallback', [suggestParameters]
		)
	;
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
	if (_.isFunction(autocompleteCallback))
	{
		this.recipientAutocompleteItem(null);
		autocompleteCallback(oRequest, fMarkRecipientsWithKeyCallback);
	}
};

EncryptFilePopup.prototype.showResults = function (oData)
{
	const {result, password, link} = oData;
	if (result)
	{
		if (this.recipientAutocompleteItem() && this.recipientAutocompleteItem().hasKey)
		{
			this.sendButtonText(TextUtils.i18n('%MODULENAME%/ACTION_SEND_ENCRYPTED_EMAIL'));
			if (this.encryptionBasedMode() === Enums.EncryptionBasedOn.Password)
			{
				this.hintUnderEncryptionInfo(TextUtils.i18n('%MODULENAME%/HINT_STORE_PASSWORD'));
			}
			else
			{
				const sUserName = this.recipientAutocompleteItem().name ? this.recipientAutocompleteItem().name : this.recipientAutocompleteItem().email;
				if (this.sign())
				{
					this.hintUnderEncryptionInfo(TextUtils.i18n('%MODULENAME%/HINT_ENCRYPTED_SIGNED_EMAIL', {'USER': sUserName}));
				}
				else
				{
					this.hintUnderEncryptionInfo(TextUtils.i18n('%MODULENAME%/HINT_ENCRYPTED_EMAIL', {'USER': sUserName}));
				}
			}
		}
		else
		{
			this.sendButtonText(TextUtils.i18n('%MODULENAME%/ACTION_SEND_EMAIL'));
			this.hintUnderEncryptionInfo(TextUtils.i18n('%MODULENAME%/HINT_EMAIL'));
		}
		this.isSuccessfullyEncryptedAndUploaded(true);
		this.encryptedFileLink(UrlUtils.getAppPath() + link);
		this.encryptedFilePassword(password);
		var oParams = {
			AddButtons: [],
			EncryptionBasedMode: this.encryptionBasedMode(),
			EncryptedFileLink: this.encryptedFileLink(),
		};
		App.broadcastEvent('%ModuleName%::ShareEncryptedFile::after', oParams);
		this.addButtons(oParams.AddButtons);
	}
	this.isEncrypting(false);
};

EncryptFilePopup.prototype.sendEmail = async function ()
{
	const sSubject = TextUtils.i18n('%MODULENAME%/MESSAGE_SUBJECT', {'FILENAME': this.oFile.fileName()});

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
			sBody = TextUtils.i18n('%MODULENAME%/ENCRYPTED_WITH_KEY_MESSAGE_BODY',
				{
					'URL': this.encryptedFileLink(),
					'USER': this.recipientAutocompleteItem().email,
					'BR': '\r\n',
					'SYSNAME': Settings.ProductName
				}
			);
		}
		const OpenPgpResult = await OpenPgpEncryptor.encryptMessage(sBody, this.recipientAutocompleteItem().email, this.sign(), this.passphrase(), this.sUserEmail);

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

EncryptFilePopup.prototype.getPublicKeysEmails = function ()
{
	let aPublicKeys = this.keys().filter(oKey => oKey.isPublic());

	return aPublicKeys.map(oKey => oKey.getEmail());
};

module.exports = new EncryptFilePopup();
