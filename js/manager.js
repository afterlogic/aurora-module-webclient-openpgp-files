'use strict';

require('modules/%ModuleName%/js/Enums.js');

function IsPgpSupported()
{
	return !!(window.crypto && window.crypto.getRandomValues);
}

module.exports =  oAppData => {
	let
		App = require('%PathToCoreWebclientModule%/js/App.js'),
		Settings = require('modules/%ModuleName%/js/Settings.js'),
		Popups = require('%PathToCoreWebclientModule%/js/Popups.js'),
		SharePopup = require('modules/%ModuleName%/js/popups/SharePopup.js'),
		CFileModel = require('modules/FilesWebclient/js/models/CFileModel.js'),
		oButtonsView = null
	;

	Settings.init(oAppData);
	function getButtonView()
	{
		if (!oButtonsView)
		{
			oButtonsView = require('modules/%ModuleName%/js/views/ButtonsView.js');
		}

		return oButtonsView;
	}

	if (App.isPublic())
	{
		return {
			getScreens: () => {
				let oScreens = {};
				oScreens[Settings.HashModuleName] = () => {
					let CFileView = require('modules/%ModuleName%/js/views/CFileView.js');
					return new CFileView();
				};
				oScreens[Settings.SelfDestructMessageHash] = () => {
					let CSelfDestructingEncryptedMessageView = require('modules/%ModuleName%/js/views/CSelfDestructingEncryptedMessageView.js');
					return new CSelfDestructingEncryptedMessageView();
				};
				return oScreens;
			}
		};
	}
	else if (App.isUserNormalOrTenant())
	{
		return {
			start: ModulesManager => {
				if (IsPgpSupported())
				{
					ModulesManager.run('FilesWebclient', 'registerToolbarButtons', [getButtonView()]);
					ModulesManager.run('MailWebclient', 'registerComposeToolbarController', [require('modules/%ModuleName%/js/views/ComposeButtonsView.js')]);
					App.subscribeEvent('FilesWebclient::ConstructView::after', function (oParams) {
						const fParentHandler = oParams.View.onShareIconClick;
						oParams.View.onShareIconClick = oItem => {
							if (oItem && oItem instanceof CFileModel
								&& oParams.View.storageType() === Enums.FileStorageType.Personal)
							{
								Popups.showPopup(SharePopup, [oItem]);
							}
							else
							{
								fParentHandler(oItem);
							}
						};
					});
				}
			}
		};
	}

	return null;
};
