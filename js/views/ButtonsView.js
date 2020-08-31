'use strict';

let
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
function СButtonsView()
{
}

СButtonsView.prototype.ViewTemplate = '%ModuleName%_ButtonsView';

СButtonsView.prototype.useFilesViewData = function (oFilesView)
{
	let selectedItem = oFilesView.selector.itemSelected;
	this.storageType = oFilesView.storageType;
	this.secureShareCommand = Utils.createCommand(this,
		() => {
			if (selectedItem().published())
			{
				Popups.showPopup(SharePopup, [selectedItem()]);
			}
			else if (selectedItem().IS_FILE && selectedItem().bIsSecure() && !selectedItem()?.oExtendedProps?.ParanoidKey)
			{
				Popups.showPopup(AlertPopup, [TextUtils.i18n('%MODULENAME%/INFO_SHARING_NOT_SUPPORTED'), null, TextUtils.i18n('%MODULENAME%/HEADING_SEND_ENCRYPTED_FILE')]);
			}
			else if (selectedItem()?.oExtendedProps?.InitializationVector)
			{
				Popups.showPopup(EncryptFilePopup, [
					selectedItem(),
					oFilesView
				]);
			}
			else
			{
				Popups.showPopup(CreatePublicLinkPopup, [
					selectedItem(),
					oFilesView
				]);
			}
		},
		() => {
			// Conditions for button activity:
			// Personal: one file or one folder
			// Corporate: one file or one folder
			// Encrypted: one file only
			// Shared: nothing
			
			return selectedItem() !== null
				&& oFilesView.checkedReadyForOperations() && oFilesView.selector.listCheckedAndSelected().length === 1
				&& !oFilesView.isZipFolder()
				&& (!selectedItem().oExtendedProps || !selectedItem().oExtendedProps.PgpEncryptionMode)
				&& (
					oFilesView.storageType() === Enums.FileStorageType.Personal
					|| oFilesView.storageType() === Enums.FileStorageType.Corporate
					|| oFilesView.storageType() === Enums.FileStorageType.Encrypted && selectedItem().IS_FILE
				)
			;
		}
	);
};

module.exports = new СButtonsView();
