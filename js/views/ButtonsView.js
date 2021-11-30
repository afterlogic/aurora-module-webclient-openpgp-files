'use strict';

var
	TextUtils = require('%PathToCoreWebclientModule%/js/utils/Text.js'),
	Utils = require('%PathToCoreWebclientModule%/js/utils/Common.js'),

	Popups = require('%PathToCoreWebclientModule%/js/Popups.js'),
	AlertPopup = require('%PathToCoreWebclientModule%/js/popups/AlertPopup.js'),
	
	EncryptFilePopup =  require('modules/%ModuleName%/js/popups/EncryptFilePopup.js'),
	SharePopup = require('modules/%ModuleName%/js/popups/SharePopup.js'),
	CreatePublicLinkPopup =  require('modules/%ModuleName%/js/popups/CreatePublicLinkPopup.js')
;

/**
 * @constructor
 */
function CButtonsView()
{
}

CButtonsView.prototype.ViewTemplate = '%ModuleName%_ButtonsView';

CButtonsView.prototype.useFilesViewData = function (oFilesView)
{
	this.secureShareCommand = Utils.createCommand(oFilesView, this.executeShare, oFilesView.isShareAllowed);
};

CButtonsView.prototype.executeShare = function ()
{
	// !!! this = oFilesView
	var
		oSelectedItem = this.selector.itemSelected(),
		oExtendedProps = oSelectedItem && oSelectedItem.oExtendedProps || {}
	;
	if (oSelectedItem.published()) {
		Popups.showPopup(SharePopup, [oSelectedItem]);
	} else if (oSelectedItem.IS_FILE && oSelectedItem.bIsSecure() && !oExtendedProps.ParanoidKey) {
		Popups.showPopup(AlertPopup, [
			TextUtils.i18n('%MODULENAME%/INFO_SHARING_NOT_SUPPORTED'),
			null,
			TextUtils.i18n('%MODULENAME%/HEADING_SEND_ENCRYPTED_FILE')
		]);
	} else if (oExtendedProps.InitializationVector) {
		Popups.showPopup(EncryptFilePopup, [
			oSelectedItem,
			this // oFilesView
		]);
	} else {
		Popups.showPopup(CreatePublicLinkPopup, [
			oSelectedItem,
			this // oFilesView
		]);
	}
};

module.exports = new CButtonsView();
