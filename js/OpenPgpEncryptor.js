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
	Enums = require('modules/%ModuleName%/js/Enums.js')
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
	if (this.keys.length === 0)
	{
		await this.oKeyring.load();
		this.reloadKeysFromStorage();
	}
};
/**
 * @return {Array}
 */
OpenPgpEncryptor.prototype.getKeys = function ()
{
	return this.keys();
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
 * @param {string} sPassword
 * @param {string} sKeyEmail
 */
OpenPgpEncryptor.prototype.decryptKeyHelper = async function (oResult, oKey, sPassword, sKeyEmail)
{
	if (oKey && oKey.primaryKey && oKey.primaryKey.isDecrypted() && sPassword === '')
	{
		//key is encoded with an empty password
	}
	else if(oKey)
	{
		try
		{
			await oKey.decrypt(Types.pString(sPassword));
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
 * @param {object} oKey
 * @param {string} sPrivateKeyPassword
 * @returns {object}
 */
OpenPgpEncryptor.prototype.verifyKeyPassword = async function (oKey, sPrivateKeyPassword)
{
	let
		oResult = new COpenPgpResult(),
		oPrivateKey = this.convertToNativeKeys([oKey])[0],
		oPrivateKeyClone = await this.cloneKey(oPrivateKey)
	;

	await this.decryptKeyHelper(oResult, oPrivateKeyClone, sPrivateKeyPassword, '');

	return oResult;
};

/**
 * @param {blob} oBlob
 * @param {string} aPrincipalsEmail
 * @param {boolean} bPasswordBasedEncryption
 * @return {COpenPgpResult}
 */
OpenPgpEncryptor.prototype.encryptData = async function (oBlob, sPrincipalsEmail, bPasswordBasedEncryption)
{
	let
		oResult = new COpenPgpResult(),
		aPublicKeys = [],
		sPassword = '',
		buffer = await new Response(oBlob).arrayBuffer()
	;

	oResult.result = false;
	if (!oResult.hasErrors())
	{
		let oOptions = {
			message: openpgp.message.fromBinary(new Uint8Array(buffer)),
			armor: false
		};
		oBlob = null;
		buffer = null;
		if (bPasswordBasedEncryption)
		{
			sPassword = this.generatePassword();
			oOptions.passwords = [sPassword];
		}
		else
		{
			aPublicKeys = this.findKeysByEmails([sPrincipalsEmail], true, oResult);
			oOptions.publicKeys = this.convertToNativeKeys(aPublicKeys);
		}

		try
		{
			let oPgpResult = await openpgp.encrypt(oOptions);

			oResult.result = {
				data:		oPgpResult.message.packets.write(),
				password:	sPassword,
			};
		}
		catch (e)
		{
			oResult.addExceptionMessage(e, Enums.OpenPgpErrors.EncryptError);
		}
	}
	else
	{
		oResult.addError(Enums.OpenPgpErrors.EncryptError);
	}

	return oResult;
};

/**
 * @param {blob} oBlob
 * @param {string} aPrincipalsEmail
 * @param {boolean} bPasswordBasedEncryption
 * @return {COpenPgpResult}
 */
OpenPgpEncryptor.prototype.encryptMessage = async function (sMessage, sPrincipalsEmail)
{
	let
		oResult = new COpenPgpResult(),
		sUserEmail = App.currentAccountEmail ? App.currentAccountEmail() : '',
		aEmailForEncrypt = this.findKeysByEmails([sUserEmail], true).length > 0 ? [sPrincipalsEmail, sUserEmail] : [sPrincipalsEmail],
		aPublicKeys = this.findKeysByEmails(aEmailForEncrypt, true, oResult)
	;

	oResult.result = false;
	if (!oResult.hasErrors())
	{
		let oOptions = {
			message: openpgp.message.fromText(sMessage),
			publicKeys: this.convertToNativeKeys(aPublicKeys)
		};

		try
		{
			let oPgpResult = await openpgp.encrypt(oOptions);
			oResult.result = oPgpResult.data;
		}
		catch (e)
		{
			oResult.addExceptionMessage(e, Enums.OpenPgpErrors.EncryptError);
		}
	}
	else
	{
		oResult.addError(Enums.OpenPgpErrors.EncryptError);
	}

	return oResult;
};

OpenPgpEncryptor.prototype.generatePassword = function ()
{
	let sPassword = "";
	const sSymbols = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!;%:?*()_+=";

	for (let i = 0; i < this.iPasswordLength; i++)
	{
		sPassword += sSymbols.charAt(Math.floor(Math.random() * sSymbols.length));     
	}

	return sPassword;
};

module.exports = new OpenPgpEncryptor();
