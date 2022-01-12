'use strict';

let
	_ = require('underscore'),
	ko = require('knockout'),
	
	TextUtils = require('%PathToCoreWebclientModule%/js/utils/Text.js'),

	CAbstractPopup = require('%PathToCoreWebclientModule%/js/popups/CAbstractPopup.js'),
	Screens = require('%PathToCoreWebclientModule%/js/Screens.js'),
	
	Popups = require('%PathToCoreWebclientModule%/js/Popups.js'),
	SharePopup = require('modules/%ModuleName%/js/popups/SharePopup.js'),
	
	OpenPgpFileProcessor = require('modules/%ModuleName%/js/OpenPgpFileProcessor.js'),
	Settings = require('modules/%ModuleName%/js/Settings.js')
;

/**
 * @constructor
 */
function CCreatePublicLinkPopup()
{
	CAbstractPopup.call(this);
	this.oItem = null;
	this.isFolder = ko.observable(false);
	this.oFilesView = null;
	this.encryptPublicLink = ko.observable(false);
	this.allowLifetime = ko.computed(function () {
		return Settings.EnablePublicLinkLifetime && this.encryptPublicLink();
	}, this);
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

_.extendOwn(CCreatePublicLinkPopup.prototype, CAbstractPopup.prototype);

CCreatePublicLinkPopup.prototype.PopupTemplate = '%ModuleName%_CreatePublicLinkPopup';

CCreatePublicLinkPopup.prototype.onOpen = function (oItem, oFilesView)
{
	this.oItem = oItem;
	this.oFilesView = oFilesView;
	this.selectedLifetimeHrs(0);
	this.isFolder(this.oItem && !this.oItem.IS_FILE);
};

CCreatePublicLinkPopup.prototype.cancelPopup = function ()
{
	this.clearPopup();
	this.closePopup();
};

CCreatePublicLinkPopup.prototype.clearPopup = function ()
{
	this.oItem = null;
	this.oFilesView = null;
	this.encryptPublicLink(false);
};

CCreatePublicLinkPopup.prototype.createPublicLink = async function ()
{
	this.isCreatingPublicLink(true);
	const oPublicLinkResult = await OpenPgpFileProcessor.createPublicLink(
		this.oItem.storageType(),
		this.oItem.path(),
		this.oItem.fileName(),
		this.oItem.IS_FILE ? this.oItem.size() : 0,
		this.encryptPublicLink(),
		'',
		'',
		this.selectedLifetimeHrs(),
		!this.oItem.IS_FILE
	);
	this.isCreatingPublicLink(false);
	if (oPublicLinkResult.result && oPublicLinkResult.link)
	{
		this.oItem.published(true);
		this.oItem.oExtendedProps.PublicLink = oPublicLinkResult.link;
		if (oPublicLinkResult.password)
		{
			this.oItem.oExtendedProps.PasswordForSharing = oPublicLinkResult.password;
		}
		Popups.showPopup(SharePopup, [this.oItem]);
		this.cancelPopup();
	}
	else
	{
		Screens.showError(oPublicLinkResult.errorMessage || TextUtils.i18n('%MODULENAME%/ERROR_CREATE_PUBLIC_LINK'));
	}
};

module.exports = new CCreatePublicLinkPopup();
