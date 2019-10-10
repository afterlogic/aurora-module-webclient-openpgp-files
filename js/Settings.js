'use strict';

let
	_ = require('underscore'),
	Types = require('%PathToCoreWebclientModule%/js/utils/Types.js')
;

module.exports = {
	ServerModuleName: 'OpenPgpFilesWebclient',
	HashModuleName: 'openpgp-files',
	ProductName: '',

	PublicFileData: {},
	/**
	 * Initializes settings from AppData object sections.
	 * 
	 * @param {Object} oAppData Object contained modules settings.
	 */
	init: function (oAppData)
	{
		let
			oAppDataOpenPgpFilesSection = oAppData[this.ServerModuleName],
			oAppDataCoreSection = oAppData['Core']
		;

		if (!_.isEmpty(oAppDataOpenPgpFilesSection))
		{
			this.PublicFileData = Types.pObject(oAppDataOpenPgpFilesSection.PublicFileData, this.PublicFileData);
		}
		if (!_.isEmpty(oAppDataCoreSection))
		{
			this.ProductName = Types.pString(oAppDataCoreSection.ProductName, this.ProductName);
		}
	}
};
