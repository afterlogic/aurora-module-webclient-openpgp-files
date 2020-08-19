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
function ButtonsView()
{
}

ButtonsView.prototype.ViewTemplate = '%ModuleName%_ButtonsView';

ButtonsView.prototype.useFilesViewData = function (oFilesView)
{
	let selectedItem = oFilesView.selector.itemSelected;
	this.storageType = oFilesView.storageType;
	this.secureShareCommand = Utils.createCommand(this,
		() => {
			let bIsFile = selectedItem().constructor.name === 'CFileModel';
			if (selectedItem().published())
			{
				Popups.showPopup(SharePopup, [selectedItem()]);
			}
			else if (bIsFile && selectedItem().bIsSecure() && !selectedItem()?.oExtendedProps?.ParanoidKey)
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
			
			// temporary disabled for folders
			let bIsFile = selectedItem() !== null && selectedItem().constructor.name === 'CFileModel';
			
			return selectedItem() !== null
				&& oFilesView.selector.listCheckedAndSelected().length === 1
				&& bIsFile
				&& !oFilesView.isZipFolder()
				&& (!selectedItem().oExtendedProps || !selectedItem().oExtendedProps.PgpEncryptionMode)
				&& (
					oFilesView.storageType() === Enums.FileStorageType.Personal || oFilesView.storageType() === Enums.FileStorageType.Corporate
					|| oFilesView.storageType() === Enums.FileStorageType.Encrypted && selectedItem().constructor.name === 'CFileModel'
				)
			;
		}
	);
};

module.exports = new ButtonsView();
