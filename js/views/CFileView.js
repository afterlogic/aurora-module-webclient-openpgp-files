'use strict';

let
	_ = require('underscore'),
	ko = require('knockout'),
	moment = require('moment'),
	videojs = require('video.js').default,

	ModulesManager = require('%PathToCoreWebclientModule%/js/ModulesManager.js'),
	TextUtils = require('%PathToCoreWebclientModule%/js/utils/Text.js'),
	UrlUtils = require('%PathToCoreWebclientModule%/js/utils/Url.js'),
	Utils = require('%PathToCoreWebclientModule%/js/utils/Common.js'),
	Screens = require('%PathToCoreWebclientModule%/js/Screens.js'),
	Settings = require('modules/%ModuleName%/js/Settings.js'),
	Ajax = require('%PathToCoreWebclientModule%/js/Ajax.js'),

	CAbstractScreenView = require('%PathToCoreWebclientModule%/js/views/CAbstractScreenView.js'),
	OpenPgpFileProcessor = require('modules/%ModuleName%/js/OpenPgpFileProcessor.js'),
	OpenPgpEncryptor = ModulesManager.run('OpenPgpWebclient', 'getOpenPgpEncryptor')
;

require('modules/%ModuleName%/styles/vendors/video-js.css');
/**
* @constructor
*/
function CFileView()
{
	CAbstractScreenView.call(this, '%ModuleName%');

	this.aSupportedVideoExt = ['mp4', 'url'];
	this.aSupportedAudioExt = ['mp3'];
	this.ExpireDate = Settings.PublicFileData.ExpireDate ? moment.unix(Settings.PublicFileData.ExpireDate).format("YYYY-MM-DD HH:mm:ss") : '';
	this.ExpireDateMessage = Settings.PublicFileData.ExpireDate ? TextUtils.i18n('%MODULENAME%/HINT_MESSAGE_LIFETIME', {'DATETIME': this.ExpireDate}) : null;

	this.password = ko.observable('');
	this.isDecryptionAvailable = ko.observable(false);
	this.isDownloadingAndDecrypting = ko.observable(false);
	this.browserTitle = ko.observable(TextUtils.i18n('%MODULENAME%/HEADING_BROWSER_TAB'));
	this.hash = Settings.PublicFileData.Hash ? Settings.PublicFileData.Hash : '';
	this.fileName = Settings.PublicFileData.Name ? Settings.PublicFileData.Name : '';
	this.fileSize = Settings.PublicFileData.Size ? Settings.PublicFileData.Size : '';
	this.fileUrl = Settings.PublicFileData.Url ? Settings.PublicFileData.Url : '';
	this.encryptionMode = Settings.PublicFileData.PgpEncryptionMode ? Settings.PublicFileData.PgpEncryptionMode : '';
	this.recipientEmail = Settings.PublicFileData.PgpEncryptionRecipientEmail ? Settings.PublicFileData.PgpEncryptionRecipientEmail : '';
	this.bSecuredLink = !!Settings.PublicFileData.IsSecuredLink;
	this.isUrlFile = Settings.PublicFileData.IsUrlFile ? Settings.PublicFileData.IsUrlFile : false;
	this.sParanoidKeyPublic = Settings.PublicFileData.ParanoidKeyPublic? Settings.PublicFileData.ParanoidKeyPublic : '';
	this.sInitializationVector = Settings.PublicFileData.InitializationVector? Settings.PublicFileData.InitializationVector : '';
	this.bShowPlayButton = ko.observable(false);
	this.bShowVideoPlayer = ko.observable(false);
	this.bShowAudioPlayer = ko.observable(false);
	this.koShowPassword = ko.computed(function () {
		return (this.isDecryptionAvailable() || this.bSecuredLink) &&
				!this.bShowVideoPlayer() && !this.bShowAudioPlayer();
	}, this);
	this.isMedia = ko.observable(false);
	if (this.bSecuredLink)
	{
		this.passwordLabel = TextUtils.i18n('%MODULENAME%/LABEL_ENTER_PASSWORD');
	}
	else
	{
		switch (this.encryptionMode)
		{
			case Enums.EncryptionBasedOn.Key:
				this.passwordLabel = TextUtils.i18n('%MODULENAME%/LABEL_ENTER_PASSPHRASE', {'KEY': this.recipientEmail});
				this.isDecryptionAvailable(true);
				break;
			case Enums.EncryptionBasedOn.Password:
				this.passwordLabel = TextUtils.i18n('%MODULENAME%/LABEL_ENTER_PASSWORD');
				this.isDecryptionAvailable(true);
				break;
			default:
				//Encryption mode not defined
				this.passwordLabel = "";
		}
	}
}

_.extendOwn(CFileView.prototype, CAbstractScreenView.prototype);

CFileView.prototype.ViewTemplate = '%ModuleName%_FileView';
CFileView.prototype.ViewConstructorName = 'CFileView';

CFileView.prototype.onShow = async function ()
{
	let isVideo = this.isFileVideo(this.fileName);
	let isAudio = this.isFileAudio(this.fileName);
	this.isMedia(isVideo || isAudio || this.isUrlFile);
	this.bShowPlayButton(this.bSecuredLink && this.isMedia());

	if (!this.bSecuredLink)
	{
		let sSrc = this.fileUrl;
		if (!this.isUrlFile)
		{
			sSrc = UrlUtils.getAppPath() + sSrc;
		}

		if(this.isUrlFile)
		{
			this.showVideoStreamPlayer(sSrc);
		}
		else if (isVideo)
		{
			this.showVideoPlayer(sSrc);
		}
		else if (isAudio)
		{
			this.showAudioPlayer(sSrc);
		}
	}
	if (this.encryptionMode === Enums.EncryptionBasedOn.Key)
	{//if encryption is based on a key - checking if the key is available
		await OpenPgpEncryptor.oPromiseInitialised;
		this.isDecryptionAvailable(!OpenPgpEncryptor.findKeysByEmails([this.recipientEmail], false).length <= 0);
	}
};

CFileView.prototype.downloadAndDecryptFile = async function ()
{
	if (this.encryptionMode === Enums.EncryptionBasedOn.Password && this.password() === '')
	{
		Screens.showError(TextUtils.i18n('%MODULENAME%/ERROR_EMPTY_PASSWORD'));
	}
	else
	{
		this.isDownloadingAndDecrypting(true);
		await OpenPgpFileProcessor.processFileDecryption(
			this.fileName,
			this.fileUrl,
			this.recipientEmail,
			this.password(),
			this.encryptionMode,
			this.sParanoidKeyPublic,
			this.sInitializationVector
		);
		this.isDownloadingAndDecrypting(false);
	}
};

CFileView.prototype.securedLinkDownload = function ()
{
	if (this.password() === '')
	{
		Screens.showError(TextUtils.i18n('%MODULENAME%/ERROR_EMPTY_PASSWORD'));
	}
	else
	{
		if (this.isUrlFile)
		{
			window.location.href = this.fileUrl;
		}
		else
		{
			window.location.href = this.fileUrl + '/download/secure/' + encodeURIComponent(this.password());
		}
	}
};

CFileView.prototype.play = function ()
{
	if (this.password() === '')
	{
		Screens.showError(TextUtils.i18n('%MODULENAME%/ERROR_EMPTY_PASSWORD'));
	}
	else
	{
		Ajax.send(
			'OpenPgpFilesWebclient',
			'ValidatePublicLinkPassword',
			{
				'Hash': this.hash,
				'Password': this.password()
			},
			oResponse => {
				if (oResponse.Result === true)
				{
					let sSrc = UrlUtils.getAppPath() + this.fileUrl + '/download/secure/' + encodeURIComponent(this.password());

					if (this.isFileVideo(this.fileName))
					{
						this.showVideoPlayer(sSrc);
					}
					else if (this.isFileAudio(this.fileName))
					{
						this.showAudioPlayer(sSrc);
					}
					else if (this.isUrlFile)
					{
						this.showVideoStreamPlayer(this.fileUrl);
					}
				}
				else if (oResponse.Result === false)
				{
					Screens.showError(TextUtils.i18n('%MODULENAME%/ERROR_PASSWORD_INCORRECT'));
				}
				else
				{
					Screens.showError(TextUtils.i18n('COREWEBCLIENT/ERROR_UNKNOWN'));
				}
			},
			this
		);
	}
};

CFileView.prototype.isFileVideo = function (sFileName)
{
	let sExt = Utils.getFileExtension(sFileName)	;

	return (-1 !== _.indexOf(this.aSupportedVideoExt, sExt.toLowerCase()));
};

CFileView.prototype.isFileAudio = function (sFileName)
{
	let sExt = Utils.getFileExtension(sFileName);

	return (-1 !== _.indexOf(this.aSupportedAudioExt, sExt.toLowerCase()));
};

CFileView.prototype.showVideoStreamPlayer = function (sSrc)
{
	let sType = 'application/x-mpegURL';
	this.oPlayer = videojs('video-player');
	this.oPlayer.src({type: sType, src: sSrc});
	this.bShowVideoPlayer(true);
};

CFileView.prototype.showVideoPlayer = function (sSrc)
{
	let sType = 'video/' + Utils.getFileExtension(this.fileName).toLowerCase();
	this.oPlayer = videojs('video-player');
	if (ModulesManager.isModuleAvailable('ActivityHistory'))
	{
		// play event is fired to many times
		this.oPlayer.on('loadeddata', () => {
			Ajax.send('ActivityHistory', 'CreateFromHash', {
				'Hash': this.hash,
				'EventName': 'play'
			});
		});
		this.oPlayer.on('ended', () => {
			Ajax.send('ActivityHistory', 'CreateFromHash', {
				'Hash': this.hash,
				'EventName': 'play-finish'
			});
		});
	}
	this.oPlayer.src({type: sType, src: sSrc});
	this.bShowVideoPlayer(true);
};

CFileView.prototype.showAudioPlayer = function (sSrc)
{
	let sType = 'audio/' + Utils.getFileExtension(this.fileName).toLowerCase();
	this.oPlayer = videojs('audio-player');
	if (ModulesManager.isModuleAvailable('ActivityHistory'))
	{
		// play event is fired to many times
		this.oPlayer.on('loadeddata', () => {
			Ajax.send('ActivityHistory', 'CreateFromHash', {
				'Hash': this.hash,
				'EventName': 'play'
			});
		});
		this.oPlayer.on('ended', () => {
			Ajax.send('ActivityHistory', 'CreateFromHash', {
				'Hash': this.hash,
				'EventName': 'play-finish'
			});
		});
	}
	this.oPlayer.src({type: sType, src: sSrc});
	this.bShowAudioPlayer(true);
};

module.exports = CFileView;
