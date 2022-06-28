'use strict';

let
	_ = require('underscore'),
	$ = require('jquery'),
	ko = require('knockout'),

	Types = require('%PathToCoreWebclientModule%/js/utils/Types.js'),

	App = require('%PathToCoreWebclientModule%/js/App.js'),
	openpgp = require('%PathToCoreWebclientModule%/js/vendors/openpgp.js'),
	COpenPgpKey = require('modules/%ModuleName%/js/COpenPgpKey.js'),
	COpenPgpResult = require('modules/%ModuleName%/js/COpenPgpResult.js'),
	Screens = require('%PathToCoreWebclientModule%/js/Screens.js'),
	TextUtils = require('%PathToCoreWebclientModule%/js/utils/Text.js')
;

/**
 * @constructor
 */
function OpenPgpEncryptor()
{
	const sPrefix = 'user_' + (App.getUserId() || '0') + '_';
	this.iPasswordLength = 15;

	this.oKeyring = new openpgp.Keyring(new openpgp.Keyring.localstore(sPrefix));
	this.keys = ko.observableArray([]);
}

OpenPgpEncryptor.prototype.oKeyring = null;
OpenPgpEncryptor.prototype.keys = [];

OpenPgpEncryptor.prototype.initKeys = async function ()
{
	await this.oKeyring.load();
	this.reloadKeysFromStorage();
};

/**
 * @return {Array}
 */
OpenPgpEncryptor.prototype.getKeys = function ()
{
	return this.keys();
};

/**
 * @return {Array}
 */
OpenPgpEncryptor.prototype.getPublicKeys = function ()
{
	return _.filter(this.keys(), oKey => {
		return oKey && oKey.isPublic() === true;
	});
};

/**
 * @return {mixed}
 */
OpenPgpEncryptor.prototype.getKeysObservable = function ()
{
	return this.keys;
};

/**
 * @private
 */
OpenPgpEncryptor.prototype.reloadKeysFromStorage = function ()
{
	let
		aKeys = [],
		oOpenpgpKeys = this.oKeyring.getAllKeys()
	;

	_.each(oOpenpgpKeys, oItem => {
		if (oItem && oItem.primaryKey)
		{
			aKeys.push(new COpenPgpKey(oItem));
		}
	});

	this.keys(aKeys);
};

/**
 * @private
 * @param {Array} aKeys
 * @return {Array}
 */
OpenPgpEncryptor.prototype.convertToNativeKeys = function (aKeys)
{
	return _.map(aKeys, oItem => {
		return (oItem && oItem.pgpKey) ? oItem.pgpKey : oItem;
	});
};

/**
 * @private
 * @param {Object} oKey
 */
OpenPgpEncryptor.prototype.cloneKey = async function (oKey)
{
	let oPrivateKey = null;
	if (oKey)
	{
		oPrivateKey = await openpgp.key.readArmored(oKey.armor());
		if (oPrivateKey && !oPrivateKey.err && oPrivateKey.keys && oPrivateKey.keys[0])
		{
			oPrivateKey = oPrivateKey.keys[0];
			if (!oPrivateKey || !oPrivateKey.primaryKey)
			{
				oPrivateKey = null;
			}
		}
		else
		{
			oPrivateKey = null;
		}
	}

	return oPrivateKey;
};

/**
 * @private
 * @param {Object} oResult
 * @param {Object} oKey
 * @param {string} sPassphrase
 * @param {string} sKeyEmail
 */
OpenPgpEncryptor.prototype.decryptKeyHelper = async function (oResult, oKey, sPassphrase, sKeyEmail)
{
	if (oKey && oKey.primaryKey && oKey.primaryKey.isDecrypted() && sPassphrase === '')
	{
		//key is encoded with an empty passphrase
	}
	else if(oKey)
	{
		try
		{
			await oKey.decrypt(Types.pString(sPassphrase));
			if (!oKey || !oKey.primaryKey || !oKey.primaryKey.isDecrypted())
			{
				oResult.addError(Enums.OpenPgpErrors.KeyIsNotDecodedError, sKeyEmail || '');
			}
		}
		catch (e)
		{
			oResult.addExceptionMessage(e, Enums.OpenPgpErrors.KeyIsNotDecodedError, sKeyEmail || '');
		}
	}
	else
	{
		oResult.addError(Enums.OpenPgpErrors.KeyIsNotDecodedError, sKeyEmail || '');
	}
};

/**
 * @private
 * @param {string} sArmor
 * @return {Array}
 */
OpenPgpEncryptor.prototype.splitKeys = function (sArmor)
{
	let
		aResult = [],
		iCount = 0,
		iLimit = 30,
		aMatch = null,
		sKey = $.trim(sArmor),
		oReg = /[\-]{3,6}BEGIN[\s]PGP[\s](PRIVATE|PUBLIC)[\s]KEY[\s]BLOCK[\-]{3,6}[\s\S]+?[\-]{3,6}END[\s]PGP[\s](PRIVATE|PUBLIC)[\s]KEY[\s]BLOCK[\-]{3,6}/gi
	;

//	If the key doesn't have any additional fields (for example "Version: 1.1"), this transformation corrupts the key.
//	Seems like it is unnecessary transformation. Everything works fine without it.
//	sKey = sKey.replace(/[\r\n]([a-zA-Z0-9]{2,}:[^\r\n]+)[\r\n]+([a-zA-Z0-9\/\\+=]{10,})/g, '\n$1---xyx---$2')
//		.replace(/[\n\r]+/g, '\n').replace(/---xyx---/g, '\n\n');

	do
	{
		aMatch = oReg.exec(sKey);
		if (!aMatch || 0 > iLimit)
		{
			break;
		}

		if (aMatch[0] && aMatch[1] && aMatch[2] && aMatch[1] === aMatch[2])
		{
			if ('PRIVATE' === aMatch[1] || 'PUBLIC' === aMatch[1])
			{
				aResult.push([aMatch[1], aMatch[0]]);
				iCount++;
			}
		}

		iLimit--;
	}
	while (true);

	return aResult;
};

/**
 * @param {string} sArmor
 * @return {Array|boolean}
 */
OpenPgpEncryptor.prototype.getArmorInfo = async function (sArmor)
{
	sArmor = $.trim(sArmor);

	let
		iIndex = 0,
		iCount = 0,
		oKey = null,
		aResult = [],
		aData = null,
		aKeys = []
	;

	if (!sArmor)
	{
		return false;
	}

	aKeys = this.splitKeys(sArmor);

	for (iIndex = 0; iIndex < aKeys.length; iIndex++)
	{
		aData = aKeys[iIndex];
		if ('PRIVATE' === aData[0])
		{
			try
			{
				oKey = await openpgp.key.readArmored(aData[1]);
				if (oKey && !oKey.err && oKey.keys && oKey.keys[0])
				{
					aResult.push(new COpenPgpKey(oKey.keys[0]));
				}

				iCount++;
			}
			catch (e)
			{
				aResult.push(null);
			}
		}
		else if ('PUBLIC' === aData[0])
		{
			try
			{
				oKey = await openpgp.key.readArmored(aData[1]);
				if (oKey && !oKey.err && oKey.keys && oKey.keys[0])
				{
					aResult.push(new COpenPgpKey(oKey.keys[0]));
				}

				iCount++;
			}
			catch (e)
			{
				aResult.push(null);
			}
		}
	}

	return aResult;
};

/**
 * @param {string} sID
 * @param {boolean} bPublic
 * @return {COpenPgpKey|null}
 */
OpenPgpEncryptor.prototype.findKeyByID = function (sID, bPublic)
{
	bPublic = !!bPublic;
	sID = sID.toLowerCase();

	let oKey = _.find(this.keys(), oKey => {

		let
			oResult = false,
			aKeys = null
		;

		if (oKey && bPublic === oKey.isPublic())
		{
			aKeys = oKey.pgpKey.getKeyIds();
			if (aKeys)
			{
				oResult = _.find(aKeys, oKey => {
					return oKey && oKey.toHex && sID === oKey.toHex().toLowerCase();
				});
			}
		}

		return !!oResult;
	});

	return oKey ? oKey : null;
};

/**
 * @param {Array} aEmail
 * @param {boolean} bIsPublic
 * @param {COpenPgpResult=} oResult
 * @return {Array}
 */
OpenPgpEncryptor.prototype.findKeysByEmails = function (aEmail, bIsPublic, oResult)
{
	bIsPublic = !!bIsPublic;

	let
		aResult = [],
		aKeys = this.keys()
	;
	_.each(aEmail, sEmail => {
		let oKey = _.find(aKeys, oKey => {
			return oKey && bIsPublic === oKey.isPublic() && sEmail === oKey.getEmail();
		});

		if (oKey)
		{
			aResult.push(oKey);
		}
		else
		{
			if (oResult)
			{
				oResult.addError(bIsPublic ?
					Enums.OpenPgpErrors.PublicKeyNotFoundError : Enums.OpenPgpErrors.PrivateKeyNotFoundError, sEmail);
			}
		}
	});

	return aResult;
};

/**
 * @param {type} aEmail
 * @returns {Array}
 */
OpenPgpEncryptor.prototype.getPublicKeysIfExistsByEmail = function (sEmail)
{
	let
		aResult = [],
		aKeys = this.keys(),
		oKey = _.find(aKeys, oKey => {
			return oKey && oKey.isPublic() === true && sEmail === oKey.getEmail();
		})
	;

	if (oKey)
	{
		aResult.push(oKey);
	}

	return aResult;
};

/**
 * @param {blob|string} Data
 * @param {string} sPrincipalsEmail
 * @param {boolean} bPasswordBasedEncryption
 * @return {COpenPgpResult}
 */
OpenPgpEncryptor.prototype.encryptData = async function (Data, sPrincipalsEmail, bPasswordBasedEncryption, bSign, sPassphrase, sFromEmail)
{
	let
		oResult = new COpenPgpResult(),
		aPublicKeys = [],
		sPassword = '',
		bIsBlob = Data instanceof Blob,
		buffer = null,
		aEmailForEncrypt = this.findKeysByEmails([sFromEmail], true).length > 0 ? [sPrincipalsEmail, sFromEmail] : [sPrincipalsEmail],
		aPrivateKeys = this.findKeysByEmails([sFromEmail], false),
		oOptions = {}
	;

	oResult.result = false;
	if (!oResult.hasErrors())
	{
		if (bIsBlob)
		{
			buffer = await new Response(Data).arrayBuffer();
			oOptions.message = openpgp.message.fromBinary(new Uint8Array(buffer));
			oOptions.armor = false;
			Data = null;
			buffer = null;
		}
		else
		{
			oOptions.message = openpgp.message.fromText(Data);
		}
		
		if (bPasswordBasedEncryption)
		{
			sPassword = this.generatePassword();
			oOptions.passwords = [sPassword];
		}
		else
		{
			aPublicKeys = this.findKeysByEmails(aEmailForEncrypt, true, oResult);
			oOptions.publicKeys = this.convertToNativeKeys(aPublicKeys);
		}

		if (bSign && aPrivateKeys && aPrivateKeys.length > 0 && !bPasswordBasedEncryption)
		{
			let
				oPrivateKey = this.convertToNativeKeys(aPrivateKeys)[0],
				oPrivateKeyClone = await this.cloneKey(oPrivateKey)
			;

			await this.decryptKeyHelper(oResult, oPrivateKeyClone, sPassphrase, sFromEmail);
			oOptions.privateKeys = [oPrivateKeyClone];
		}
		if (!oResult.hasErrors())
		{
			try
			{
				let oPgpResult = await openpgp.encrypt(oOptions);

				oResult.result = {
					data:		bIsBlob ? oPgpResult.message.packets.write() : oPgpResult.data,
					password:	sPassword
				};
			}
			catch (e)
			{
				oResult.addExceptionMessage(e, Enums.OpenPgpErrors.EncryptError);
			}
		}
	}

	return oResult;
};

/**
 * @param {blob|string} Data
 * @param {string} sAccountEmail
 * @param {string} sPassword
 * @param {boolean} sPassword
 * @return {string}
 */
OpenPgpEncryptor.prototype.decryptData = async function (Data, sAccountEmail, sPassword, bPasswordBasedEncryption)
{
	let
		oResult = new COpenPgpResult(),
		bIsBlob = Data instanceof Blob,
		buffer = null,
		aPrivateKeys = [],
		aPublicKeys = this.getPublicKeys(),
		oOptions = {
			publicKeys: this.convertToNativeKeys(aPublicKeys) // for verification
		}
	;

	if (bIsBlob)
	{
		buffer = await new Response(Data).arrayBuffer();
		oOptions.message = await openpgp.message.read(new Uint8Array(buffer));
		oOptions.format = 'binary';
	}
	else
	{
		oOptions.message = await openpgp.message.readArmored(Data);
	}
	oResult.result = false;
	if (bPasswordBasedEncryption)
	{
		oOptions.passwords = [sPassword];
	}
	else
	{
		aPrivateKeys = this.findKeysByEmails([sAccountEmail], false, oResult);
		if (aPrivateKeys && aPrivateKeys.length > 0)
		{
			let
				oPrivateKey = this.convertToNativeKeys(aPrivateKeys)[0],
				oPrivateKeyClone = await this.cloneKey(oPrivateKey)
			;
			await this.decryptKeyHelper(oResult, oPrivateKeyClone, sPassword, sAccountEmail);
			oOptions.privateKeys = oPrivateKeyClone;
		}
	}

	if (!oResult.hasErrors())
	{
		try
		{
			let oPgpResult = await openpgp.decrypt(oOptions);
			oResult.result = await openpgp.stream.readToEnd(oPgpResult.data);
			//if result contains invalid signatures 
			let aValidityPromises = [];
			for (let oSignature of oPgpResult.signatures)
			{
				aValidityPromises.push(
					oSignature.verified
					.then(validity => {
						oSignature.is_valid = validity;
						return oSignature;
					})
				);
			}
			await Promise.all(aValidityPromises)
			.then(aSignatures => {
				const aInvalidSignatures = _.filter(aSignatures, oSignature => {
					return oSignature !== null && oSignature.is_valid !== true;
				});
				const aValidSignatures = _.filter(aSignatures, oSignature => {
					return oSignature !== null && oSignature.is_valid === true;
				});

				if (oPgpResult.signatures.length && aInvalidSignatures.length > 0)
				{
					Screens.showError(TextUtils.i18n('%MODULENAME%/ERROR_SIGNATURE_VERIFICATION'));
				}
				else if (aValidSignatures.length > 0)
				{
					const aKeyNames = _.map(aValidSignatures, oSignature => {
						const sKeyID = oSignature.keyid.toHex();
						const oKey = this.findKeyByID(sKeyID, true);
						return oKey.getUser();
					});
					let sReportText = TextUtils.i18n('%MODULENAME%/REPORT_SUCCESSFULL_SIGNATURE_VERIFICATION');
					sReportText = sReportText + ' ' + aKeyNames.join(', ').replace(/</g, "&lt;").replace(/>/g, "&gt;");
					Screens.showReport(sReportText);
				}
			});
		}
		catch (e)
		{
			if (bPasswordBasedEncryption)
			{
				oResult.addExceptionMessage(e, Enums.OpenPgpErrors.PasswordDecryptError);
			}
			else
			{
				oResult.addExceptionMessage(e, Enums.OpenPgpErrors.VerifyAndDecryptError);
			}
		}
	}

	return oResult;
};

/**
 * @param {Blob} oBlob
 * @return {boolean}
 */
OpenPgpEncryptor.prototype.isDataEncryptedWithPassword = async function (oBlob)
{
	let buffer = await new Response(oBlob).arrayBuffer();
	let message = await openpgp.message.read(new Uint8Array(buffer));
	return !!message.packets.findPacket(openpgp.enums.packet.symEncryptedSessionKey);
};

/**
 * @param {string} sMessage
 * @param {string} aPrincipalsEmail
 * @param {boolean} bPasswordBasedEncryption
 * @return {COpenPgpResult}
 */
OpenPgpEncryptor.prototype.encryptMessage = async function (sMessage, sPrincipalsEmail, bSign, sPassphrase, sFromEmail)
{
	let oEncryptionResult = await this.encryptData(sMessage, sPrincipalsEmail, /*bPasswordBasedEncryption*/false, bSign, sPassphrase, sFromEmail);

	if (oEncryptionResult.result)
	{
		let {data, password} = oEncryptionResult.result;
		oEncryptionResult.result = data;
	}

	return oEncryptionResult;
};

OpenPgpEncryptor.prototype.generatePassword = function ()
{
	let sPassword = "";

	if (window.crypto)
	{
		let password = window.crypto.getRandomValues(new Uint8Array(10));
		sPassword = btoa(String.fromCharCode.apply(null, password));
		sPassword = sPassword.replace(/[^A-Za-z0-9]/g, "");
	}
	else
	{
		const sSymbols = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!;%:?*()_+=";

		for (let i = 0; i < this.iPasswordLength; i++)
		{
			sPassword += sSymbols.charAt(Math.floor(Math.random() * sSymbols.length));     
		}
	}

	return sPassword;
};

OpenPgpEncryptor.prototype.getEncryptionKeyFromArmoredMessage = async function (sArmoredMessage)
{
	let oMessage = await openpgp.message.readArmored(sArmoredMessage);

	let aEncryptionKeys = oMessage.getEncryptionKeyIds();
	let oEncryptionKey = null;

	if (aEncryptionKeys.length > 0)
	{
		for (let key of aEncryptionKeys)
		{
			let oKey = this.findKeyByID(key.toHex(), false);
			if (oKey)
			{
				oEncryptionKey = oKey;
				break;
			}
		}
	}

	return oEncryptionKey;
};

module.exports = new OpenPgpEncryptor();
