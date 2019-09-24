'use strict';

let
	CFileModel = require('modules/FilesWebclient/js/models/CFileModel.js'),
	Utils = require('%PathToCoreWebclientModule%/js/utils/Common.js'),
	OpenPgpFileProcessor = require('modules/%ModuleName%/js/OpenPgpFileProcessor.js')
;

/**
 * @constructor
 */
function ButtonsView()
{
	this.oFilesView = null;
	this.oFile = null;
}

ButtonsView.prototype.ViewTemplate = '%ModuleName%_ButtonsView';

ButtonsView.prototype.useFilesViewData = function (oFilesView)
{
	let selectedItem = oFilesView.selector.itemSelected;
	this.storageType = oFilesView.storageType;
	this.secureShareCommand = Utils.createCommand(this,
		() => {
			OpenPgpFileProcessor.processFile(selectedItem(), oFilesView);
		},
		() => {//button is active only when one file is selected
			return selectedItem() !== null
				&& oFilesView.selector.listCheckedAndSelected().length === 1
				&& selectedItem() instanceof CFileModel
				&& oFilesView.storageType() === Enums.FileStorageType.Personal;
		}
	);
};

module.exports = new ButtonsView();
