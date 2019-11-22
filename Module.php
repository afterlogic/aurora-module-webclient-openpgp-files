<?php
/**
 * This code is licensed under AGPLv3 license or Afterlogic Software License
 * if commercial version of the product was purchased.
 * For full statements of the licenses see LICENSE-AFTERLOGIC and LICENSE-AGPL3 files.
 */

namespace Aurora\Modules\OpenPgpFilesWebclient;

/**
 * @license https://www.gnu.org/licenses/agpl-3.0.html AGPL-3.0
 * @license https://afterlogic.com/products/common-licensing Afterlogic Software License
 * @copyright Copyright (c) 2019, Afterlogic Corp.
 *
 * @package Modules
 */
class Module extends \Aurora\System\Module\AbstractWebclientModule
{
	const SUPPORTED_FILE_EXTENSIONS = ['gpg'];
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
	}

	private function isEncryptedFileType($sFileName)
	{
		return in_array(pathinfo($sFileName, PATHINFO_EXTENSION), self::SUPPORTED_FILE_EXTENSIONS);
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

		$aSettings = array();
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
				$oUser->{self::GetName().'::EnableModule'} = $EnableModule;
				return $oCoreDecorator->UpdateUserObject($oUser);
			}
			if ($oUser->Role === \Aurora\System\Enums\UserRole::SuperAdmin)
			{
				return true;
			}
		}

		return false;
	}

	public function CreatePublicLink($UserId, $Type, $Path, $Name, $Size, $IsFolder, $Password = '')
	{
		\Aurora\System\Api::checkUserRoleIsAtLeast(\Aurora\System\Enums\UserRole::NormalUser);
		$mResult = [];
		$oUser = \Aurora\System\Api::getAuthenticatedUser();
		if ($oUser instanceof \Aurora\Modules\Core\Classes\User)
		{
			$sID = \Aurora\Modules\Min\Module::generateHashId([$oUser->PublicId, $Type, $Path, $Name]);
			$oMin = \Aurora\Modules\Min\Module::getInstance();
			$mMin = $oMin->GetMinByID($sID);
			if (!empty($mMin['__hash__']))
			{
				$mResult['link'] = '?/files-pub/' . $mMin['__hash__'] . '/list';
				$mResult['password'] = isset($mMin['Password']) ? \Aurora\System\Utils::DecryptValue($mMin['Password']) : '';
			}
			else
			{
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
				$sHash = $oMin->createMin(
					$sID,
					$aProps
				);
				$mMin = $oMin->GetMinByHash($sHash);
				if (!empty($mMin['__hash__']))
				{
					$mResult['link'] = '?/files-pub/' . $mMin['__hash__'] . '/list';
					$mResult['password'] = isset($mMin['Password']) ? $mMin['Password'] : '';
				}
			}
		}

		return $mResult;
	}
	/***** public functions might be called with web API *****/

	public function onFileEntryPub(&$aData, &$mResult)
	{
		if ($aData
			&& isset($aData['IsFolder'])
			&& !$aData['IsFolder']
			&& isset($aData['Name'])
			&& isset($aData['UserId'])
			&& isset($aData['Type'])
			&& isset($aData['Path'])
		)
		{
			if ($this->isEncryptedFileType($aData['Name']))
			{
				$oUser = \Aurora\System\Api::GetModuleDecorator('Core')->GetUserByPublicId($aData['UserId']);
				if ($oUser)
				{
					$bPrevState = \Aurora\System\Api::skipCheckUserRole(true);
					$aFileInfo = \Aurora\System\Api::GetModuleDecorator('Files')->GetFileInfo($aData['UserId'], $aData['Type'], $aData['Path'], $aData['Name']);
					\Aurora\System\Api::skipCheckUserRole($bPrevState);
					$oApiIntegrator = \Aurora\System\Managers\Integrator::getInstance();
					if ($oApiIntegrator && $aFileInfo && isset($aFileInfo->ExtendedProps) && isset($aFileInfo->ExtendedProps['PgpEncryptionMode']))
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
									'modules_list' => $oApiIntegrator->GetModulesForEntry('OpenPgpFilesWebclient')
								];
								//passing file data to AppData throughGetSettings. GetSettings will be called in $oApiIntegrator->buildBody
								$oFilesWebclientModule = \Aurora\System\Api::GetModule('FilesWebclient');
								if ($oFilesWebclientModule instanceof \Aurora\System\Module\AbstractModule)
								{
									$sUrl = (bool) $oFilesWebclientModule->getConfig('ServerUseUrlRewrite', false) ? '/download/' : '?/files-pub/';
									$this->aPublicFileData = [
										'Name'					=> $aData['Name'],
										'Size'						=> \Aurora\System\Utils::GetFriendlySize($aData['Size']),
										'Url'						=> $sUrl . $aData['__hash__'],
										'PgpEncryptionMode'			=> $aFileInfo->ExtendedProps['PgpEncryptionMode'],
										'PgpEncryptionRecipientEmail'	=> $aFileInfo->ExtendedProps['PgpEncryptionRecipientEmail']
									];
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
			else if (isset($aData['Password']))
			{
				$oUser = \Aurora\System\Api::GetModuleDecorator('Core')->GetUserByPublicId($aData['UserId']);
				if ($oUser)
				{
					$oApiIntegrator = \Aurora\System\Managers\Integrator::getInstance();
					if ($oApiIntegrator)
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
									'modules_list' => $oApiIntegrator->GetModulesForEntry('OpenPgpFilesWebclient')
								];
								//passing file data to AppData throughGetSettings. GetSettings will be called in $oApiIntegrator->buildBody
								$oFilesWebclientModule = \Aurora\System\Api::GetModule('FilesWebclient');
								if ($oFilesWebclientModule instanceof \Aurora\System\Module\AbstractModule)
								{
									$sUrl = (bool) $oFilesWebclientModule->getConfig('ServerUseUrlRewrite', false) ? '/download/' : '?/files-pub/';
									$this->aPublicFileData = [
										'Name'		=> $aData['Name'],
										'Size'			=> \Aurora\System\Utils::GetFriendlySize($aData['Size']),
										'Url'			=> $sUrl . $aData['__hash__'],
										'IsSecuredLink'	=> true
									];
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
			&& $oItem->TypeStr === 'personal'
			&& isset($oItem->IsFolder)
			&& !$oItem->IsFolder
		)
		{
			$oUser = \Aurora\System\Api::getUserById($aArgs['UserId']);
			$iAuthenticatedUserId = \Aurora\System\Api::getAuthenticatedUserId();
			if ($oUser instanceof \Aurora\Modules\Core\Classes\User
				&& $iAuthenticatedUserId === $aArgs['UserId']
			)
			{
				$sID = \Aurora\Modules\Min\Module::generateHashId([$oUser->PublicId, $oItem->TypeStr, $oItem->Path, $oItem->Name]);
				$mMin = \Aurora\Modules\Min\Module::getInstance()->GetMinByID($sID);
				if (!empty($mMin['__hash__']))
				{
					$aExtendedProps = array_merge($oItem->ExtendedProps, [
						'PasswordForSharing'	=> !empty($mMin['Password']) ? \Aurora\System\Utils::DecryptValue($mMin['Password']) : '',
						'PublicLink'		=> '?/files-pub/' . $mMin['__hash__'] . '/list'
					]);
					$oItem->ExtendedProps = $aExtendedProps;
				}
			}
		}
	}
}
