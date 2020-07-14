'use strict';

let
	CFileModel = require('modules/FilesWebclient/js/models/CFileModel.js'),
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
		() => {//button is active only when one file is selected
			return selectedItem() !== null
				&& oFilesView.selector.listCheckedAndSelected().length === 1
				&& selectedItem() instanceof CFileModel
				&& !oFilesView.isZipFolder()
				&& (oFilesView.storageType() === Enums.FileStorageType.Personal
					|| oFilesView.storageType() === Enums.FileStorageType.Encrypted)
				&& (!selectedItem().oExtendedProps || !selectedItem().oExtendedProps.PgpEncryptionMode);
		}
	);
};

module.exports = new ButtonsView();
