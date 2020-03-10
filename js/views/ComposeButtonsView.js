'use strict';

var
	Popups = require('%PathToCoreWebclientModule%/js/Popups.js'),
	SelfDestructingEncryptedMessagePopup = require('modules/%ModuleName%/js/popups/SelfDestructingEncryptedMessagePopup.js')
;

/**
 * @constructor for object that display buttons "PGP Sign/Encrypt" and "Undo PGP"
 */
function CComposeButtonsView()
{
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
 */
CComposeButtonsView.prototype.assignComposeExtInterface = function (oCompose)
{
	this.oCompose = oCompose;
};

CComposeButtonsView.prototype.send = function ()
{
	if (this.oCompose)
	{
		Popups.showPopup(SelfDestructingEncryptedMessagePopup, [
			this.oCompose.getSubject(),
			this.oCompose.getPlainText(),
			this.oCompose.getRecipientEmails()[0] ? this.oCompose.getRecipientEmails()[0] : null
		]);
	}
};

/**
 * Determines if sending a message is allowed.
 */
CComposeButtonsView.prototype.isEnableSending = function ()
{
	return this.oCompose;
};

module.exports = new CComposeButtonsView();
