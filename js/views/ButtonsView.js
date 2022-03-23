'use strict';

var
	ko = require('knockout'),

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
	this.isCreateSecureLinkAllowed = ko.computed(function () {
		const
			items = this.selector.listCheckedAndSelected(),
			selectedItem = items.length === 1 ? items[0] : null
		;
		return !this.isZipFolder() &&
				(!this.sharedParentFolder() || this.sharedParentFolder().sharedWithMeAccessReshare()) &&
				this.allSelectedFilesReady() &&
				selectedItem && !selectedItem.bIsLink &&
				(!selectedItem.sharedWithMe() || selectedItem.sharedWithMeAccessReshare());
	}, oFilesView);
	this.createSecureLinkCommand = Utils.createCommand(oFilesView, this.createSecureLink, this.isCreateSecureLinkAllowed);
};

CButtonsView.prototype.createSecureLink = function ()
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
