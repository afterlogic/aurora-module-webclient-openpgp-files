'use strict';

var
	ko = require('knockout'),

	Popups = require('%PathToCoreWebclientModule%/js/Popups.js'),
	SelfDestructingEncryptedMessagePopup = require('modules/%ModuleName%/js/popups/SelfDestructingEncryptedMessagePopup.js')
;

/**
 * @constructor for object that display buttons "PGP Sign/Encrypt" and "Undo PGP"
 */
function CComposeButtonsView()
{
	this.bSendButton = true;
	this.pgpSecured = ko.observable(false);
}

CComposeButtonsView.prototype.ViewTemplate = '%ModuleName%_ComposeButtonsView';

/**
 * Assigns compose external interface.
 *
 * @param {Object} oCompose Compose external interface object.
 * @param {Function} oCompose.isHtml Returns **true** if html mode is switched on in html editor.
 * @param {Function} oCompose.hasAttachments Returns **true** if some files were attached to message.
 * @param {Function} oCompose.getPlainText Returns plain text from html editor. If html mode is switched on html text will be converted to plain and returned.
 * @param {Function} oCompose.getFromEmail Returns message sender email.
 * @param {Function} oCompose.getRecipientEmails Returns array of message recipients.
 * @param {Function} oCompose.saveSilently Saves message silently (without buttons disabling and any info messages).
 * @param {Function} oCompose.setPlainTextMode Sets plain text mode switched on.
 * @param {Function} oCompose.setPlainText Sets plain text to html editor.
 * @param {Function} oCompose.setHtmlTextMode Sets html text mode switched on.
 * @param {Function} oCompose.setHtmlText Sets html text to html editor.
 * @param {Function} oCompose.undoHtml Undo last changes in html editor.
 *
 * @param oCompose.koTextChange Triggered on changing text in compose
 *
 */
CComposeButtonsView.prototype.assignComposeExtInterface = function (oCompose)
{
	this.oCompose = oCompose;
	this.oCompose.koTextChange.subscribe(function () {
		var sPlainText = oCompose.getPlainText();
		if (!oCompose.isHtml()) {
			this.pgpSecured(sPlainText.indexOf('-----BEGIN PGP MESSAGE-----') !== -1);
		}
	}, this);
};

/**
 * @param {Object} oParameters
 */
CComposeButtonsView.prototype.doAfterApplyingMainTabParameters = function (oParameters)
{
	if (oParameters.OpenPgp)
	{
		this.pgpSecured(oParameters.OpenPgp.Secured);
	}
};

/**
 * @param {Object} oParameters
 */
CComposeButtonsView.prototype.doAfterPreparingMainTabParameters = function (oParameters)
{
	oParameters.OpenPgp = {
		Secured: this.pgpSecured()
	};
};

/**
 * Receives message properties that are displayed when opening the compose popup.
 *
 * @param {Object} oMessageProps Receiving message properties.
 * @param {Boolean} oMessageProps.bDraft **true** if message was opened from drafts folder.
 * @param {Boolean} oMessageProps.bPlain **true** if opened for compose message if plain.
 * @param {String} oMessageProps.sRawText Raw plain text of opened for compose message.
 */
CComposeButtonsView.prototype.doAfterPopulatingMessage = function (oMessageProps)
{
	if (oMessageProps.bPlain)
	{
		this.pgpSecured(oMessageProps.sRawText.indexOf('-----BEGIN PGP MESSAGE-----') !== -1);
	}
	else
	{
		this.pgpSecured(false);
	}
};

CComposeButtonsView.prototype.send = function ()
{
	if (this.oCompose)
	{
		Popups.showPopup(SelfDestructingEncryptedMessagePopup, [
			this.oCompose.getSubject(),
			this.oCompose.getPlainText(),
			this.oCompose.getRecipientEmails()[0] ? this.oCompose.getRecipientEmails()[0] : null,
			this.oCompose.getFromEmail(),
			this.oCompose.getSelectedSender()
		]);
	}
};

/**
 * Determines if sending a message is allowed.
 */
CComposeButtonsView.prototype.isEnableSending = function ()
{
	return this.oCompose && !this.pgpSecured();
};

module.exports = new CComposeButtonsView();
