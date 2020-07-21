'use strict';

let
	Utils = require('%PathToCoreWebclientModule%/js/utils/Common.js'),

	Popups = require('%PathToCoreWebclientModule%/js/Popups.js'),
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
			if (selectedItem().published())
			{
				Popups.showPopup(SharePopup, [selectedItem()]);
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
				&& oFilesView.selector.listCheckedAndSelected().length === 1
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
