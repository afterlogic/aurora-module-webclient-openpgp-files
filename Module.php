<?php
/**
 * This code is licensed under AGPLv3 license or Afterlogic Software License
 * if commercial version of the product was purchased.
 * For full statements of the licenses see LICENSE-AFTERLOGIC and LICENSE-AGPL3 files.
 */

namespace Aurora\Modules\OpenPgpFilesWebclient;

use Afterlogic\DAV\Server;
use Aurora\Modules\Files\Enums\ErrorCodes;
use Aurora\Modules\Files\Module as FilesModule;
use Aurora\System\Exceptions\ApiException;

/**
 * @license https://www.gnu.org/licenses/agpl-3.0.html AGPL-3.0
 * @license https://afterlogic.com/products/common-licensing Afterlogic Software License
 * @copyright Copyright (c) 2019, Afterlogic Corp.
 *
 * @package Modules
 */
class Module extends \Aurora\System\Module\AbstractWebclientModule
{
	private $aPublicFileData = null;

	public function init()
	{
		\Aurora\Modules\Core\Classes\User::extend(
			self::GetName(),
			[
				'EnableModule'	=> array('bool', false),
			]
		);
		$this->subscribeEvent('FileEntryPub', array($this, 'onFileEntryPub'));
		$this->subscribeEvent('Files::PopulateFileItem::after', array($this, 'onAfterPopulateFileItem'));
		$this->subscribeEvent('Files::CheckUrl', array($this, 'onCheckUrl'), 90);
		$this->subscribeEvent('Files::DeletePublicLink::after', [$this, 'onAfterDeletePublicLink']);

		$oFilesModule = FilesModule::getInstance();
		if ($oFilesModule) {
			$this->aErrors = [
				ErrorCodes::NotPermitted => $oFilesModule->i18N('INFO_NOTPERMITTED')
			];
		}
	}

	private function isUrlFileType($sFileName)
	{
		return in_array(pathinfo($sFileName, PATHINFO_EXTENSION), ['url']);
	}

	/***** public functions might be called with web API *****/
	/**
	 * Obtains list of module settings for authenticated user.
	 *
	 * @return array
	 */
	public function GetSettings()
	{
		\Aurora\System\Api::checkUserRoleIsAtLeast(\Aurora\System\Enums\UserRole::Anonymous);

		$aSettings = array(
			'EnableSelfDestructingMessages' => $this->getConfig('EnableSelfDestructingMessages', false),
			'EnablePublicLinkLifetime' => $this->getConfig('EnablePublicLinkLifetime', false),
		);
		$oUser = \Aurora\System\Api::getAuthenticatedUser();
		if ($oUser && $oUser->isNormalOrTenant())
		{
			if (isset($oUser->{self::GetName().'::EnableModule'}))
			{
				$aSettings['EnableModule'] = $oUser->{self::GetName().'::EnableModule'};
			}
		}
		if ($this->aPublicFileData)
		{
			$aSettings['PublicFileData'] = $this->aPublicFileData;
		}

		return $aSettings;
	}

	public function UpdateSettings($EnableModule)
	{
		\Aurora\System\Api::checkUserRoleIsAtLeast(\Aurora\System\Enums\UserRole::NormalUser);

		$oUser = \Aurora\System\Api::getAuthenticatedUser();
		if ($oUser)
		{
			if ($oUser->isNormalOrTenant())
			{
				$oCoreDecorator = \Aurora\Modules\Core\Module::Decorator();
				$oUser->setExtendedProp(self::GetName().'::EnableModule', $EnableModule);
				return $oCoreDecorator->UpdateUserObject($oUser);
			}
			if ($oUser->Role === \Aurora\System\Enums\UserRole::SuperAdmin)
			{
				return true;
			}
		}

		return false;
	}

	public function CreatePublicLink($UserId, $Type, $Path, $Name, $Size, $IsFolder, $Password = '', $RecipientEmail = '', $PgpEncryptionMode = '', $LifetimeHrs = 0)
	{
		\Aurora\System\Api::checkUserRoleIsAtLeast(\Aurora\System\Enums\UserRole::NormalUser);
		$mResult = [];
		$oUser = \Aurora\System\Api::getAuthenticatedUser();
		if ($oUser instanceof \Aurora\Modules\Core\Models\User)
		{
			$sID = \Aurora\Modules\Min\Module::generateHashId([$oUser->PublicId, $Type, $Path, $Name]);
			$oMin = \Aurora\Modules\Min\Module::getInstance();
			$mMin = $oMin->GetMinByID($sID);
			if (!empty($mMin['__hash__']))
			{
				$mResult['link'] = '?/files-pub/' . $mMin['__hash__'] . '/list';
			}
			else
			{
				$oNode = Server::getNodeForPath('files/' . $Type . '/' . $Path . '/' . $Name);
				if ($oNode instanceof \Afterlogic\DAV\FS\Shared\Directory) {
					throw new ApiException(ErrorCodes::NotPermitted);
				}
				$aProps = [
					'UserId' => $oUser->PublicId,
					'Type' => $Type,
					'Path' => $Path,
					'Name' => $Name,
					'Size' => $Size,
					'IsFolder' => $IsFolder
				];
				if (!empty($Password))
				{
					$aProps['Password'] = \Aurora\System\Utils::EncryptValue($Password);
				}
				if (!empty($RecipientEmail))
				{
					$aProps['RecipientEmail'] = $RecipientEmail;
				}
				if (!empty($PgpEncryptionMode))
				{
					$aProps['PgpEncryptionMode'] = $PgpEncryptionMode;
				}
				if ($LifetimeHrs === 0)
				{
					$sHash = $oMin->createMin(
						$sID,
						$aProps,
						$oUser->Id
					);
				}
				else
				{
					$iExpireDate = time() + ((int) $LifetimeHrs * 60 * 60);
					$sHash = $oMin->createMin(
						$sID,
						$aProps,
						$oUser->Id,
						$iExpireDate
					);
				}
				$mMin = $oMin->GetMinByHash($sHash);
				if (!empty($mMin['__hash__']))
				{
					$mResult['link'] = '?/files-pub/' . $mMin['__hash__'] . '/list';
				}
			}
		}

		return $mResult;
	}

	public function CreateSelfDestrucPublicLink($UserId, $Subject, $Data, $RecipientEmail, $PgpEncryptionMode, $LifetimeHrs)
	{
		\Aurora\System\Api::checkUserRoleIsAtLeast(\Aurora\System\Enums\UserRole::NormalUser);
		$mResult = [];
		$oUser = \Aurora\System\Api::getAuthenticatedUser();
		if ($oUser instanceof \Aurora\Modules\Core\Models\User)
		{
			$sID = \Aurora\Modules\Min\Module::generateHashId([$oUser->PublicId, $Subject, $Data]);
			$oMin = \Aurora\Modules\Min\Module::getInstance();
			$mMin = $oMin->GetMinByID($sID);
			if (!empty($mMin['__hash__']))
			{
				$mResult['link'] = '?/files-pub/' . $mMin['__hash__'] . '/list';
			}
			else
			{
				$aProps = [
					'UserId' => $oUser->PublicId,
					'Subject' => $Subject,
					'Data' => $Data,
					'RecipientEmail' => $RecipientEmail,
					'PgpEncryptionMode' => $PgpEncryptionMode
				];
				$iExpireDate = time() + ((int) $LifetimeHrs * 60 * 60);
				$sHash = $oMin->createMin(
					$sID,
					$aProps,
					$oUser->Id,
					$iExpireDate
				);
				$mMin = $oMin->GetMinByHash($sHash);
				if (!empty($mMin['__hash__']))
				{
					$mResult['link'] = '?/files-pub/' . $mMin['__hash__'] . '/list';
				}
			}
		}

		return $mResult;
	}

	public function ValidatePublicLinkPassword($UserId, $Hash, $Password)
	{
		\Aurora\System\Api::checkUserRoleIsAtLeast(\Aurora\System\Enums\UserRole::Anonymous);
		$bResult = false;
		$oMin = \Aurora\Modules\Min\Module::getInstance();
		$mMin = $oMin->GetMinByHash($Hash);
		if ($mMin && isset($mMin['Password']) && \Aurora\System\Utils::DecryptValue($mMin['Password']) === $Password)
		{
			$bResult = true;
		}

		return $bResult;
	}

	/***** public functions might be called with web API *****/

	public function onFileEntryPub(&$aData, &$mResult)
	{
		if ($aData && isset($aData['UserId']))
		{
			$bLinkOrFile = isset($aData['IsFolder']) && !$aData['IsFolder'] && isset($aData['Name']) && isset($aData['Type']) && isset($aData['Path']);
			$bSelfDestructingEncryptedMessage = isset($aData['Subject']) && isset($aData['Data']) && isset($aData['PgpEncryptionMode']) && isset($aData['RecipientEmail']);
			if ($bLinkOrFile || $bSelfDestructingEncryptedMessage)
			{
				$bIsUrlFile = isset($aData['Name']) ? $this->isUrlFileType($aData['Name']) : false;;
				$oUser = \Aurora\System\Api::GetModuleDecorator('Core')->GetUserByPublicId($aData['UserId']);
				if ($oUser)
				{
					$bPrevState = \Aurora\System\Api::skipCheckUserRole(true);

					$aCurSession = \Aurora\System\Api::GetUserSession();
					\Aurora\System\Api::SetUserSession([
						'UserId' => $oUser->Id
					]);

					$sType = isset($aData['Type']) ? $aData['Type'] : '';
					$sPath = isset($aData['Path']) ? $aData['Path'] : '';
					$sName = isset($aData['Name']) ? $aData['Name'] : '';
					$aFileInfo = \Aurora\System\Api::GetModuleDecorator('Files')->GetFileInfo($aData['UserId'], $sType, $sPath, $sName);

					\Aurora\System\Api::SetUserSession($aCurSession);

					\Aurora\System\Api::skipCheckUserRole($bPrevState);
					$bIsEncyptedFile = $aFileInfo
						&& isset($aFileInfo->ExtendedProps)
						&& isset($aFileInfo->ExtendedProps['ParanoidKeyPublic']);
					$bIsSetPgpEncryptionMode = isset($aData['PgpEncryptionMode']);
					$oApiIntegrator = \Aurora\System\Managers\Integrator::getInstance();

					if ($oApiIntegrator
						&& (($bIsEncyptedFile && $bIsSetPgpEncryptionMode)
							|| !$bIsEncyptedFile)
					)
					{
						$oCoreClientModule = \Aurora\System\Api::GetModule('CoreWebclient');
						if ($oCoreClientModule instanceof \Aurora\System\Module\AbstractModule)
						{
							$sResult = \file_get_contents($oCoreClientModule->GetPath().'/templates/Index.html');
							if (\is_string($sResult))
							{
								$oSettings =& \Aurora\System\Api::GetSettings();
								$sFrameOptions = $oSettings->GetValue('XFrameOptions', '');
								if (0 < \strlen($sFrameOptions))
								{
									@\header('X-Frame-Options: '.$sFrameOptions);
								}
								$aConfig = [
									'public_app' => true,
									'modules_list' => array_merge(
										$oApiIntegrator->GetModulesForEntry('OpenPgpFilesWebclient'),
										$oApiIntegrator->GetModulesForEntry('OpenPgpWebclient')
									)
								];
								//passing data to AppData throughGetSettings. GetSettings will be called in $oApiIntegrator->buildBody
								$oFilesWebclientModule = \Aurora\System\Api::GetModule('FilesWebclient');
								if ($oFilesWebclientModule instanceof \Aurora\System\Module\AbstractModule)
								{
									$sUrl = (bool) $oFilesWebclientModule->getConfig('ServerUseUrlRewrite', false) ? '/download/' : '?/files-pub/';
									$this->aPublicFileData = [
										'Url'	=> $sUrl . $aData['__hash__'],
										'Hash'	=> $aData['__hash__']
									];
									if ($bSelfDestructingEncryptedMessage)
									{
										$this->aPublicFileData['Subject'] =  $aData['Subject'];
										$this->aPublicFileData['Data'] =  $aData['Data'];
										$this->aPublicFileData['PgpEncryptionMode'] =  $aData['PgpEncryptionMode'];
										$this->aPublicFileData['RecipientEmail'] =  $aData['RecipientEmail'];
										$this->aPublicFileData['ExpireDate'] = isset($aData['expire_date']) ? $aData['expire_date'] : null;
									}
									else if ($bIsEncyptedFile)
									{
										$this->aPublicFileData['PgpEncryptionMode'] = $aData['PgpEncryptionMode'];
										$this->aPublicFileData['PgpEncryptionRecipientEmail'] = isset($aData['RecipientEmail']) ? $aData['RecipientEmail'] : '';
										$this->aPublicFileData['Size'] =  \Aurora\System\Utils::GetFriendlySize($aData['Size']);
										$this->aPublicFileData['Name'] =  $aData['Name'];
										$this->aPublicFileData['ParanoidKeyPublic'] = $aFileInfo->ExtendedProps['ParanoidKeyPublic'];
										$this->aPublicFileData['InitializationVector'] = $aFileInfo->ExtendedProps['InitializationVector'];
									}
									else if ($bIsUrlFile)
									{
										$mFile = \Aurora\System\Api::GetModuleDecorator('Files')->getRawFileData($aData['UserId'], $aData['Type'], $aData['Path'], $aData['Name'], $aData['__hash__'], 'view');
										if (\is_resource($mFile))
										{
											$mFile = \stream_get_contents($mFile);
										}
										$aUrlFileInfo = \Aurora\System\Utils::parseIniString($mFile);
										if ($aUrlFileInfo && isset($aUrlFileInfo['URL']))
										{
											$sUrl = $aUrlFileInfo['URL'];
											$sFileName = basename($sUrl);
											$sFileExtension = \Aurora\System\Utils::GetFileExtension($sFileName);
											if (\strtolower($sFileExtension) === 'm3u8')
											{
												$this->aPublicFileData['Url'] = $sUrl;
												$this->aPublicFileData['Name'] =  $sFileName; #$aData['Name'];
												$this->aPublicFileData['IsSecuredLink'] = isset($aData['Password']);
												$this->aPublicFileData['IsUrlFile'] =  true;
											}
										}
									}
									else
									{//encrypted link
										$this->aPublicFileData['Size'] =  \Aurora\System\Utils::GetFriendlySize($aData['Size']);
										$this->aPublicFileData['Name'] =  $aData['Name'];
										$this->aPublicFileData['IsSecuredLink'] = isset($aData['Password']);
										$this->aPublicFileData['ExpireDate'] = isset($aData['expire_date']) ? $aData['expire_date'] : null;
									}
									$mResult = \strtr(
										$sResult,
										[
											'{{AppVersion}}' => AU_APP_VERSION,
											'{{IntegratorDir}}' => $oApiIntegrator->isRtl() ? 'rtl' : 'ltr',
											'{{IntegratorLinks}}' => $oApiIntegrator->buildHeadersLink(),
											'{{IntegratorBody}}' => $oApiIntegrator->buildBody($aConfig)
										]
									);
								}
							}
						}
					}
				}
			}
		}
	}

	public function onAfterPopulateFileItem($aArgs, &$oItem)
	{
		\Aurora\System\Api::checkUserRoleIsAtLeast(\Aurora\System\Enums\UserRole::NormalUser);
		if (isset($aArgs['UserId']) &&
			$oItem instanceof \Aurora\Modules\Files\Classes\FileItem
			&& isset($oItem->TypeStr)
		)
		{
			$oUser = \Aurora\System\Api::getUserById($aArgs['UserId']);
			$iAuthenticatedUserId = \Aurora\System\Api::getAuthenticatedUserId();
			if ($oUser instanceof \Aurora\Modules\Core\Models\User
				&& $iAuthenticatedUserId === $aArgs['UserId']
			)
			{
				$sID = \Aurora\Modules\Min\Module::generateHashId([$oUser->PublicId, $oItem->TypeStr, $oItem->Path, $oItem->Name]);
				$mMin = \Aurora\Modules\Min\Module::getInstance()->GetMinByID($sID);
				if (!empty($mMin['__hash__']))
				{
					$aExtendedProps = array_merge($oItem->ExtendedProps, [
						'PasswordForSharing'			=> !empty($mMin['Password']) ? \Aurora\System\Utils::DecryptValue($mMin['Password']) : '',
						'PublicLink'					=> '?/files-pub/' . $mMin['__hash__'] . '/list',
						'PublicLinkPgpEncryptionMode'	=> isset($mMin['PgpEncryptionMode']) ? $mMin['PgpEncryptionMode'] : '',
					]);
					$oItem->ExtendedProps = $aExtendedProps;
				}
			}
		}
	}

	public function onCheckUrl($aArgs, &$mResult)
	{
		if (!empty($aArgs['Url']))
		{
			$sUrl = $aArgs['Url'];
			if ($sUrl)
			{
				$sFileName = basename($sUrl);
				$sFileExtension = \Aurora\System\Utils::GetFileExtension($sFileName);
				if (\strtolower($sFileExtension) === 'm3u8')
				{
					$mResult['Name'] = $sFileName;
					return true;
				}
			}
		}
	}

	public function onAfterDeletePublicLink(&$aArgs, &$mResult)
	{
		\Aurora\Modules\Files\Module::Decorator()->UpdateExtendedProps(
			$aArgs['UserId'],
			$aArgs['Type'],
			$aArgs['Path'],
			$aArgs['Name'],
			['ParanoidKeyPublic' => null]
		 );
	}
}
