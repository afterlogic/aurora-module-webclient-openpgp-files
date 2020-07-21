'use strict';

let
	_ = require('underscore'),
	Types = require('%PathToCoreWebclientModule%/js/utils/Types.js')
;

module.exports = {
	ServerModuleName: 'OpenPgpFilesWebclient',
	HashModuleName: 'openpgp-files',
	SelfDestructMessageHash: 'self-destruct',
	ProductName: '',

	EnableSelfDestructingMessages: true,
	EnablePublicLinkLifetime: true,
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
			this.EnableSelfDestructingMessages = Types.pBool(oAppDataOpenPgpFilesSection.EnableSelfDestructingMessages, this.EnableSelfDestructingMessages);
			this.EnablePublicLinkLifetime = Types.pBool(oAppDataOpenPgpFilesSection.EnablePublicLinkLifetime, this.EnablePublicLinkLifetime);
			this.PublicFileData = Types.pObject(oAppDataOpenPgpFilesSection.PublicFileData, this.PublicFileData);
		}
		if (!_.isEmpty(oAppDataCoreSection))
		{
			this.ProductName = Types.pString(oAppDataCoreSection.ProductName, this.ProductName);
		}
	}
};
