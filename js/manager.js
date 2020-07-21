'use strict';

require('modules/%ModuleName%/js/Enums.js');

function IsPgpSupported()
{
	return !!(window.crypto && window.crypto.getRandomValues);
}

module.exports = oAppData => {
	if (!IsPgpSupported())
	{
		return null;
	}

	let
		App = require('%PathToCoreWebclientModule%/js/App.js'),
		Settings = require('modules/%ModuleName%/js/Settings.js'),
		Popups = require('%PathToCoreWebclientModule%/js/Popups.js'),
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
				if (Settings.EnableSelfDestructingMessages)
				{
					oScreens[Settings.SelfDestructMessageHash] = () => {
						let CSelfDestructingEncryptedMessageView = require('modules/%ModuleName%/js/views/CSelfDestructingEncryptedMessageView.js');
						return new CSelfDestructingEncryptedMessageView();
					};
				}
				return oScreens;
			}
		};
	}
	else if (App.isUserNormalOrTenant())
	{
		return {
			start: ModulesManager => {
				let SharePopup = require('modules/%ModuleName%/js/popups/SharePopup.js');
				ModulesManager.run('FilesWebclient', 'registerToolbarButtons', [getButtonView()]);
				if (Settings.EnableSelfDestructingMessages)
				{
					ModulesManager.run('MailWebclient', 'registerComposeToolbarController', [require('modules/%ModuleName%/js/views/ComposeButtonsView.js')]);
				}
				App.subscribeEvent('FilesWebclient::ConstructView::after', function (oParams) {
					const fParentHandler = oParams.View.onShareIconClick;
					oParams.View.onShareIconClick = oItem => {
						if (oItem && oItem instanceof CFileModel
							&& (oParams.View.storageType() === Enums.FileStorageType.Personal
								|| oParams.View.storageType() === Enums.FileStorageType.Encrypted)
						)
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
		};
	}

	return null;
};
