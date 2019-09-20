'use strict';

require('modules/%ModuleName%/js/Enums.js');

function IsPgpSupported()
{
	return !!(window.crypto && window.crypto.getRandomValues);
}

module.exports =  oAppData => {
	var
		App = require('%PathToCoreWebclientModule%/js/App.js'),
		oButtonsView = null
	;

	function getButtonView()
	{
		if (!oButtonsView)
		{
			oButtonsView = require('modules/%ModuleName%/js/views/ButtonsView.js');
		}

		return oButtonsView;
	}

	if (App.isUserNormalOrTenant())
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
