'use strict';

let
	_ = require('underscore'),
	Types = require('%PathToCoreWebclientModule%/js/utils/Types.js')
;

module.exports = {
	ServerModuleName: 'OpenPgpFilesWebclient',
	HashModuleName: 'openpgp-files',

	PublicFileData: {},
	/**
	 * Initializes settings from AppData object sections.
	 * 
	 * @param {Object} oAppData Object contained modules settings.
	 */
	init: function (oAppData)
	{
		let
			oAppDataOpenPgpFilesSection = oAppData[this.ServerModuleName]
		;

		if (!_.isEmpty(oAppDataOpenPgpFilesSection))
		{
			this.PublicFileData = Types.pObject(oAppDataOpenPgpFilesSection.PublicFileData, this.PublicFileData);
		}
	}
};
