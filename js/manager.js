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
				}
			}
		};
	}

	return null;
};
