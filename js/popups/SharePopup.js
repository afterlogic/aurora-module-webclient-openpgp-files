'use strict';

let
	_ = require('underscore'),
	ko = require('knockout'),

	TextUtils = require('%PathToCoreWebclientModule%/js/utils/Text.js'),
	UrlUtils = require('%PathToCoreWebclientModule%/js/utils/Url.js'),

	Ajax = require('%PathToCoreWebclientModule%/js/Ajax.js'),
	App = require('%PathToCoreWebclientModule%/js/App.js'),
	CAbstractPopup = require('%PathToCoreWebclientModule%/js/popups/CAbstractPopup.js'),
	ModulesManager = require('%PathToCoreWebclientModule%/js/ModulesManager.js'),
	Popups = require('%PathToCoreWebclientModule%/js/Popups.js'),
	Screens = require('%PathToCoreWebclientModule%/js/Screens.js'),

	ErrorsUtils = require('modules/%ModuleName%/js/utils/Errors.js'),

	ShowHistoryPopup = ModulesManager.run('ActivityHistory', 'getShowHistoryPopup'),
	OpenPgpEncryptor = ModulesManager.run('OpenPgpWebclient', 'getOpenPgpEncryptor')
;

/**
 * @constructor
 */
function CSharePopup()
{
	CAbstractPopup.call(this);

	this.item = null;
	this.publicLink = ko.observable('');
	this.password = ko.observable('');
	this.publicLinkFocus = ko.observable(false);
	this.isRemovingPublicLink = ko.observable(false);
	this.keys = ko.observableArray([]);
	this.recipientAutocomplete = ko.observable('');
	this.recipientAutocompleteItem = ko.observable(null);
	this.isEmailEncryptionAvailable = ko.observable(false);
	this.sendLinkHintText = ko.observable('');
	this.linkLabel = ko.computed(function () {
		if (this.password())
		{
			return TextUtils.i18n('%MODULENAME%/LABEL_PROTECTED_PUBLIC_LINK');
		}
		return TextUtils.i18n('%MODULENAME%/LABEL_PUBLIC_LINK');
	}, this);
	this.signEmailHintText = ko.observable(TextUtils.i18n('%MODULENAME%/HINT_NOT_SIGN_EMAIL'));
	this.sign = ko.observable(false);
	this.isPrivateKeyAvailable = ko.observable(false);
	this.isSigningAvailable = ko.observable(false);
	this.sUserEmail = '';
	this.recipientAutocompleteItem.subscribe( oItem => {
		if (oItem)
		{
			let sHint = TextUtils.i18n('%MODULENAME%/HINT_SEND_LINK');
			if (oItem.hasKey)
			{
				if (this.password())
				{
					sHint = TextUtils.i18n('%MODULENAME%/HINT_SEND_LINK_AND_PASSWORD');
					this.isEmailEncryptionAvailable(true);
				}
				else
				{
					this.isEmailEncryptionAvailable(false);
				}
				if (this.isPrivateKeyAvailable() && this.isEmailEncryptionAvailable())
				{
					sHint = TextUtils.i18n('%MODULENAME%/HINT_SEND_LINK_AND_PASSWORD_SIGNED');
					this.isSigningAvailable(true);
					this.sign(true);
				}
			}
			else
			{
				this.isEmailEncryptionAvailable(false);
				if (this.password())
				{
					sHint = TextUtils.i18n('%MODULENAME%/HINT_SEND_DIFFERENT_CHANNEL');
				}
				this.isSigningAvailable(false);
				this.sign(false);
			}
			this.sendLinkHintText(sHint);
		}
		else
		{
			this.isSigningAvailable(false);
			this.sign(false);
		}
	});
	this.sign.subscribe(bSign => {
		if (bSign)
		{
			this.signEmailHintText(TextUtils.i18n('%MODULENAME%/HINT_SIGN_EMAIL'));
			this.sendLinkHintText(TextUtils.i18n('%MODULENAME%/HINT_SEND_LINK_AND_PASSWORD_SIGNED'));
		}
		else
		{
			this.signEmailHintText(TextUtils.i18n('%MODULENAME%/HINT_NOT_SIGN_EMAIL'));
			this.sendLinkHintText(TextUtils.i18n('%MODULENAME%/HINT_SEND_LINK_AND_PASSWORD'));
		}
	});
	this.composeMessageWithData = ModulesManager.run('MailWebclient', 'getComposeMessageWithData');
	this.bAllowSendMessage = !!this.composeMessageWithData;

	this.bAllowShowHistory = !!ShowHistoryPopup;
	
	this.addButtons = ko.observableArray([]);
}

_.extendOwn(CSharePopup.prototype, CAbstractPopup.prototype);

CSharePopup.prototype.PopupTemplate = '%ModuleName%_SharePopup';

/**
 * @param {Object} oItem
 */
CSharePopup.prototype.onOpen = async function (oItem)
{
	this.item = oItem;

	this.publicLink('');
	this.password('');
	
	if (this.item.published()
		&& this.item.oExtendedProps
		&& this.item.oExtendedProps.PublicLink
	)
	{
		this.publicLink(UrlUtils.getAppPath() + this.item.oExtendedProps.PublicLink);
		this.publicLinkFocus(true);
		this.password(this.item.oExtendedProps.PasswordForSharing ? this.item.oExtendedProps.PasswordForSharing : '');
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
		var oParams = {
			AddButtons: [],
			Item: oItem
		};
		App.broadcastEvent('%ModuleName%::OpenSharePopup::after', oParams);
		this.addButtons(oParams.AddButtons);
	}
	else
	{
		Screens.showError(TextUtils.i18n('%MODULENAME%/ERROR_GET_PUBLIC_LINK'));
	}
};

CSharePopup.prototype.cancelPopup = function ()
{
	this.clearPopup();
	this.closePopup();
};

CSharePopup.prototype.clearPopup = function ()
{
	this.recipientAutocompleteItem(null);
	this.recipientAutocomplete('');
	this.sign(false);
	this.isEmailEncryptionAvailable(false);
	this.sUserEmail = '';
};

CSharePopup.prototype.onCancelSharingClick = function ()
{
	if (this.item)
	{
		this.isRemovingPublicLink(true);
		Ajax.send('Files',
			'DeletePublicLink',
			{
				'Type': this.item.storageType(),
				'Path': this.item.path(),
				'Name': this.item.fileName()
			},
			this.onCancelSharingResponse,
			this
		);
	}
};

CSharePopup.prototype.onCancelSharingResponse = function (oResponse, oRequest)
{
	this.isRemovingPublicLink(false);
	if (oResponse.Result)
	{
		this.item.published(false);
		this.item.oExtendedProps.PublicLink = null;
		if (this.item.oExtendedProps.PasswordForSharing)
		{
			this.item.oExtendedProps.PasswordForSharing = null;
		}
		this.cancelPopup();
	}
	else
	{
		Screens.showError(TextUtils.i18n('%MODULENAME%/ERROR_DELETE_PUBLIC_LINK'));
	}
};

/**
 * @param {object} oRequest
 * @param {function} fResponse
 */
CSharePopup.prototype.autocompleteCallback = function (oRequest, fResponse)
{
	if (!this.item) {
		fResponse([]);
		return;
	}

	const
		suggestParameters = {
			storage: 'all',
			addContactGroups: false,
			addUserGroups: false,
			exceptEmail: this.item.sOwnerName
		},
		autocompleteCallback = ModulesManager.run(
			'ContactsWebclient', 'getSuggestionsAutocompleteCallback', [suggestParameters]
		)
	;

	const fMarkRecipientsWithKeyCallback = (aRecipienstList) => {
		let aPublicKeys = this.getPublicKeys();
		let iOwnPublicKeyIndex = aPublicKeys.indexOf(App.getUserPublicId());
		if (iOwnPublicKeyIndex > -1)
		{//remove own public key from list
			aPublicKeys.splice(iOwnPublicKeyIndex, 1);
		}
		aRecipienstList.forEach(oRecipient => {
			const iIndex = aPublicKeys.indexOf(oRecipient.email);
			if (iIndex > -1)
			{
				oRecipient.hasKey = true;
				//remove key from list when recipient is marked
				aPublicKeys.splice(iIndex, 1);
			}
			else
			{
				oRecipient.hasKey = false;
			}
		});
		aPublicKeys.forEach(sPublicKey => {
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

CSharePopup.prototype.getPublicKeys = function ()
{
	let aPublicKeys = this.keys().filter(oKey => oKey.isPublic());

	return aPublicKeys.map(oKey => oKey.getEmail());
};

CSharePopup.prototype.sendEmail = async function ()
{
	const sSubject = TextUtils.i18n('%MODULENAME%/PUBLIC_LINK_MESSAGE_SUBJECT', {'FILENAME': this.item.fileName()});

	if (this.recipientAutocompleteItem().hasKey && this.isEmailEncryptionAvailable())
	{//message is encrypted
		let sBody = '';
		if (this.password())
		{
			sBody = TextUtils.i18n('%MODULENAME%/ENCRYPTED_LINK_MESSAGE_BODY_WITH_PASSWORD',
				{
					'URL': this.publicLink(),
					'BR': '\r\n',
					'PASSWORD': this.password()
				}
			);
		}
		else
		{
			sBody = TextUtils.i18n('%MODULENAME%/ENCRYPTED_LINK_MESSAGE_BODY',
				{
					'URL': this.publicLink(),
					'BR': '\r\n'
				}
			);
		}
		const OpenPgpResult = await OpenPgpEncryptor.encryptMessage(sBody, this.recipientAutocompleteItem().email, this.sign(), '', this.sUserEmail);
		if (OpenPgpResult && OpenPgpResult.result)
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
		else if (!OpenPgpResult || !OpenPgpResult.userCanceled)
		{
			ErrorsUtils.showPgpErrorByCode(OpenPgpResult, Enums.PgpAction.Encrypt);
		}
	}
	else
	{//message is not encrypted
		const sBody = TextUtils.i18n('%MODULENAME%/LINK_MESSAGE_BODY', {'URL': this.publicLink()});
		this.composeMessageWithData({
			to: this.recipientAutocompleteItem().value,
			subject: sSubject,
			body: sBody,
			isHtml: true
		});
		this.cancelPopup();
	}
};

CSharePopup.prototype.showHistory = function () {
	if (this.bAllowShowHistory)
	{
		Popups.showPopup(ShowHistoryPopup, [TextUtils.i18n('%MODULENAME%/HEADING_HISTORY_POPUP'), this.item]);
	}
}

module.exports = new CSharePopup();