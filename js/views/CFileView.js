'use strict';

let
	_ = require('underscore'),
	ko = require('knockout'),
	videojs = require('video.js'),

	TextUtils = require('%PathToCoreWebclientModule%/js/utils/Text.js'),
	UrlUtils = require('%PathToCoreWebclientModule%/js/utils/Url.js'),
	Utils = require('%PathToCoreWebclientModule%/js/utils/Common.js'),
	Screens = require('%PathToCoreWebclientModule%/js/Screens.js'),
	Settings = require('modules/%ModuleName%/js/Settings.js'),
	Ajax = require('%PathToCoreWebclientModule%/js/Ajax.js'),

	CAbstractScreenView = require('%PathToCoreWebclientModule%/js/views/CAbstractScreenView.js'),
	OpenPgpFileProcessor = require('modules/%ModuleName%/js/OpenPgpFileProcessor.js'),
	OpenPgpEncryptor = require('modules/%ModuleName%/js/OpenPgpEncryptor.js')
;

require('node_modules/video.js/dist/video-js.css');
/**
* @constructor
*/
function CFileView()
{
	CAbstractScreenView.call(this, '%ModuleName%');

	this.aSupportedVideoExt = ['mp4'];
	this.aSupportedAudioExt = ['mp3'];
	
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
	this.bShowPlayButton = ko.observable(false);
	this.bShowVideoPlayer = ko.observable(false);
	this.bShowAudioPlayer = ko.observable(false);
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
	this.bShowPlayButton(this.bSecuredLink && (isVideo || isAudio));
	this.isMedia(isVideo || isAudio);
	if (!this.bSecuredLink)
	{
		let sSrc = UrlUtils.getAppPath() + this.fileUrl;
		if (isVideo)
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
		await OpenPgpEncryptor.initKeys();
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
		await OpenPgpFileProcessor.processFileDecryption(this.fileName, this.fileUrl, this.recipientEmail, this.password(), this.encryptionMode);
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
		window.location.href = this.fileUrl + '/download/secure/' + encodeURIComponent(this.password());
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

CFileView.prototype.showVideoPlayer = function (sSrc)
{
	let sType = 'video/' + Utils.getFileExtension(this.fileName).toLowerCase();
	this.oPlayer = videojs.default('video-player');
	this.oPlayer.src({type: sType, src: sSrc});
	this.bShowVideoPlayer(true);
};

CFileView.prototype.showAudioPlayer = function (sSrc)
{
	let sType = 'audio/' + Utils.getFileExtension(this.fileName).toLowerCase();
	this.oPlayer = videojs.default('audio-player');
	this.oPlayer.src({type: sType, src: sSrc});
	this.bShowAudioPlayer(true);
};

module.exports = CFileView;
