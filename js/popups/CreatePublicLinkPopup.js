'use strict';

let
	_ = require('underscore'),
	ko = require('knockout'),

	CAbstractPopup = require('%PathToCoreWebclientModule%/js/popups/CAbstractPopup.js'),
	OpenPgpFileProcessor = require('modules/%ModuleName%/js/OpenPgpFileProcessor.js'),
	Popups = require('%PathToCoreWebclientModule%/js/Popups.js'),
	SharePopup = require('modules/%ModuleName%/js/popups/SharePopup.js'),
	TextUtils = require('%PathToCoreWebclientModule%/js/utils/Text.js'),
	Screens = require('%PathToCoreWebclientModule%/js/Screens.js')
;
/**
 * @constructor
 */
function CreatePublicLinkPopup()
{
	CAbstractPopup.call(this);
	this.oFile = null;
	this.oFilesView = null;
	this.encryptPublicLink = ko.observable(false);
	this.isCreatingPublicLink = ko.observable(false);
	this.selectedLifetimeHrs = ko.observable(null);
	this.lifetime = ko.observableArray([
		{
			label: TextUtils.i18n('%MODULENAME%/OPTION_LIFE_TIME_ETERNAL'),
			value: 0
		},
		{
			label: "24 " + TextUtils.i18n('%MODULENAME%/OPTION_LIFE_TIME_HOURS'),
			value: 24
		},
		{
			label: "72 " + TextUtils.i18n('%MODULENAME%/OPTION_LIFE_TIME_HOURS'),
			value: 72
		},
		{
			label: "7 " + TextUtils.i18n('%MODULENAME%/OPTION_LIFE_TIME_DAYS'),
			value: 7 * 24
		}
	]);
}

_.extendOwn(CreatePublicLinkPopup.prototype, CAbstractPopup.prototype);

CreatePublicLinkPopup.prototype.PopupTemplate = '%ModuleName%_CreatePublicLinkPopup';

CreatePublicLinkPopup.prototype.onOpen = function (oFile, oFilesView)
{
	this.oFile = oFile;
	this.oFilesView = oFilesView;
	this.selectedLifetimeHrs(0);
};

CreatePublicLinkPopup.prototype.cancelPopup = function ()
{
	this.clearPopup();
	this.closePopup();
};

CreatePublicLinkPopup.prototype.clearPopup = function ()
{
	this.oFile = null;
	this.oFilesView = null;
	this.encryptPublicLink(false);
};

CreatePublicLinkPopup.prototype.createPublicLink = async function ()
{
	this.isCreatingPublicLink(true);
	const oPublicLinkResult = await OpenPgpFileProcessor.createPublicLink(
		this.oFile.storageType(),
		this.oFile.path(),
		this.oFile.fileName(),
		this.oFile.size(),
		this.encryptPublicLink(),
		'',
		'',
		this.selectedLifetimeHrs()
	);
	this.isCreatingPublicLink(false);
	if (oPublicLinkResult.result && oPublicLinkResult.link)
	{
		this.oFile.published(true);
		this.oFile.oExtendedProps.PublicLink = oPublicLinkResult.link;
		if (oPublicLinkResult.password)
		{
			this.oFile.oExtendedProps.PasswordForSharing = oPublicLinkResult.password;
		}
		Popups.showPopup(SharePopup, [this.oFile]);
		this.cancelPopup();
	}
	else
	{
		Screens.showError(TextUtils.i18n('%MODULENAME%/ERROR_CREATE_PUBLIC_LINK'));
	}
};

module.exports = new CreatePublicLinkPopup();
