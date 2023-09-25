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
 * @copyright Copyright (c) 2023, Afterlogic Corp.
 *
 * @property Settings $oModuleSettings
 *
 * @package Modules
 */
class Module extends \Aurora\System\Module\AbstractWebclientModule
{
    protected $aRequireModules = array(
        'Files'
    );

    private $aPublicFileData = null;

    private $aHashes = [];

    /** @var \Aurora\Modules\Files\Module */
    private $oFilesdecorator = null;

    public function init()
    {
        $this->subscribeEvent('FileEntryPub', array($this, 'onFileEntryPub'));
        $this->subscribeEvent('Files::PopulateFileItem::after', array($this, 'onAfterPopulateFileItem'));
        $this->subscribeEvent('Files::CheckUrl', array($this, 'onCheckUrl'), 90);
        $this->subscribeEvent('Files::DeletePublicLink::after', [$this, 'onAfterDeletePublicLink']);
        $this->subscribeEvent('Min::DeleteExpiredHashes::before', [$this, 'onBeforeDeleteExpiredHashes']);
        $this->subscribeEvent('Min::DeleteExpiredHashes::after', [$this, 'onAfterDeleteExpiredHashes']);
        $this->subscribeEvent('Files::GetPublicFiles::before', [$this, 'onBeforeGetPublicFiles']);
        $this->subscribeEvent('System::RunEntry::before', array($this, 'onBeforeRunEntry'));

        $oFilesModule = FilesModule::getInstance();
        if ($oFilesModule) {
            $this->aErrors = [
                ErrorCodes::NotPermitted => $oFilesModule->i18N('INFO_NOTPERMITTED')
            ];
        }

        $this->oFilesdecorator = \Aurora\System\Api::GetModuleDecorator('Files');
    }

    /**
     * @return Module
     */
    public static function getInstance()
    {
        return parent::getInstance();
    }

    /**
     * @return Module
     */
    public static function Decorator()
    {
        return parent::Decorator();
    }

    /**
     * @return Settings
     */
    public function getModuleSettings()
    {
        return $this->oModuleSettings;
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
            'EnableSelfDestructingMessages' => $this->oModuleSettings->EnableSelfDestructingMessages,
            'EnablePublicLinkLifetime' => $this->oModuleSettings->EnablePublicLinkLifetime,
        );
        $oUser = \Aurora\System\Api::getAuthenticatedUser();
        if ($oUser && $oUser->isNormalOrTenant()) {
            if (null !== $oUser->getExtendedProp(self::GetName() . '::EnableModule')) {
                $aSettings['EnableModule'] = $oUser->getExtendedProp(self::GetName() . '::EnableModule');
            }
        }
        if ($this->aPublicFileData) {
            $aSettings['PublicFileData'] = $this->aPublicFileData;
        }

        return $aSettings;
    }

    public function UpdateSettings($EnableModule)
    {
        \Aurora\System\Api::checkUserRoleIsAtLeast(\Aurora\System\Enums\UserRole::NormalUser);

        $oUser = \Aurora\System\Api::getAuthenticatedUser();
        if ($oUser) {
            if ($oUser->isNormalOrTenant()) {
                $oCoreDecorator = \Aurora\Modules\Core\Module::Decorator();
                $oUser->setExtendedProp(self::GetName() . '::EnableModule', $EnableModule);
                return $oCoreDecorator->UpdateUserObject($oUser);
            }
            if ($oUser->Role === \Aurora\System\Enums\UserRole::SuperAdmin) {
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
        if ($oUser instanceof \Aurora\Modules\Core\Models\User) {
            if (empty($Type) || empty($Name)) {
                throw new \Aurora\System\Exceptions\ApiException(\Aurora\System\Notifications::InvalidInputParameter);
            }
            $sID = \Aurora\Modules\Min\Module::generateHashId([$oUser->PublicId, $Type, $Path, $Name]);
            $oMin = \Aurora\Modules\Min\Module::getInstance();
            $mMin = $oMin->GetMinByID($sID);
            if (!empty($mMin['__hash__']) && $mMin['UserId'] && $mMin['UserId'] === $oUser->PublicId) {
                $mResult['link'] = '?/files-pub/' . $mMin['__hash__'] . '/list';
                if (!empty($mMin['Password'])) {
                    $mResult['password'] = \Aurora\System\Utils::DecryptValue($mMin['Password']);
                }
            } else {
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
                if (!empty($Password)) {
                    $aProps['Password'] = \Aurora\System\Utils::EncryptValue($Password);
                }
                if (!empty($RecipientEmail)) {
                    $aProps['RecipientEmail'] = $RecipientEmail;
                }
                if (!empty($PgpEncryptionMode)) {
                    $aProps['PgpEncryptionMode'] = $PgpEncryptionMode;
                }
                if ($LifetimeHrs === 0) {
                    $sHash = $oMin->createMin(
                        $sID,
                        $aProps,
                        $oUser->Id
                    );
                } else {
                    $iExpireDate = time() + ((int) $LifetimeHrs * 60 * 60);
                    $sHash = $oMin->createMin(
                        $sID,
                        $aProps,
                        $oUser->Id,
                        $iExpireDate
                    );
                }
                $mMin = $oMin->GetMinByHash($sHash);
                if (!empty($mMin['__hash__'])) {
                    $mResult['link'] = '?/files-pub/' . $mMin['__hash__'] . '/list';
                    if (!empty($mMin['Password'])) {
                        $mResult['password'] = \Aurora\System\Utils::DecryptValue($mMin['Password']);
                    }
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
        if ($oUser instanceof \Aurora\Modules\Core\Models\User) {
            $sID = \Aurora\Modules\Min\Module::generateHashId([$oUser->PublicId, $Subject, $Data]);
            $oMin = \Aurora\Modules\Min\Module::getInstance();
            $mMin = $oMin->GetMinByID($sID);
            if (!empty($mMin['__hash__'])) {
                $mResult['link'] = '?/files-pub/' . $mMin['__hash__'] . '/list';
            } else {
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
                if (!empty($mMin['__hash__'])) {
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
        if ($mMin && isset($mMin['Password']) && \Aurora\System\Utils::DecryptValue($mMin['Password']) === $Password) {
            $bResult = true;
        }

        return $bResult;
    }

    /***** public functions might be called with web API *****/

    public function onFileEntryPub(&$aData, &$mResult)
    {
        if ($aData && isset($aData['UserId'])) {
            if (isset($aData['ExpireDate'])) {
                $iExpireDate = (int) $aData['ExpireDate'];
                if ($iExpireDate > 0 && time() > $iExpireDate) {
                    $oModuleManager = \Aurora\System\Api::GetModuleManager();
                    $sTheme = $oModuleManager->getModuleConfigValue('CoreWebclient', 'Theme');
                    $sResult = \file_get_contents($this->GetPath() . '/templates/Expired.html');
                    $mResult = \strtr($sResult, array(
                        '{{Expired}}' => $this->i18N('HINT_MESSAGE_LINK_EXPIRED'),
                        '{{Theme}}' => $sTheme,
                    ));
                    return;
                }
            }

            $bLinkOrFile = isset($aData['IsFolder']) && !$aData['IsFolder'] && isset($aData['Name']) && isset($aData['Type']) && isset($aData['Path']);
            $bSelfDestructingEncryptedMessage = isset($aData['Subject']) && isset($aData['Data']) && isset($aData['PgpEncryptionMode']) && isset($aData['RecipientEmail']);
            if ($bLinkOrFile || $bSelfDestructingEncryptedMessage) {
                $bIsUrlFile = isset($aData['Name']) ? $this->isUrlFileType($aData['Name']) : false;

                /** @var \Aurora\Modules\Core\Module $oCoreDecorator */
                $oCoreDecorator = \Aurora\System\Api::GetModuleDecorator('Core');
                $oUser = $oCoreDecorator->GetUserByPublicId($aData['UserId']);
                if ($oUser) {
                    $bPrevState = \Aurora\System\Api::skipCheckUserRole(true);

                    $aCurSession = \Aurora\System\Api::GetUserSession();
                    \Aurora\System\Api::SetUserSession([
                        'UserId' => $oUser->Id
                    ]);

                    $sType = isset($aData['Type']) ? $aData['Type'] : '';
                    $sPath = isset($aData['Path']) ? $aData['Path'] : '';
                    $sName = isset($aData['Name']) ? $aData['Name'] : '';

                    $aFileInfo = $this->oFilesdecorator->GetFileInfo($aData['UserId'], $sType, $sPath, $sName);

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
                    ) {
                        $oCoreClientModule = \Aurora\System\Api::GetModule('CoreWebclient');
                        if ($oCoreClientModule instanceof \Aurora\System\Module\AbstractModule) {
                            $sResult = \file_get_contents($oCoreClientModule->GetPath() . '/templates/Index.html');
                            if (\is_string($sResult)) {
                                $oSettings = &\Aurora\System\Api::GetSettings();
                                $sFrameOptions = $oSettings->XFrameOptions;
                                if (0 < \strlen($sFrameOptions)) {
                                    @\header('X-Frame-Options: ' . $sFrameOptions);
                                }
                                $aConfig = [
                                    'public_app' => true,
                                    'modules_list' => array_merge(
                                        $oApiIntegrator->GetModulesForEntry('OpenPgpFilesWebclient'),
                                        $oApiIntegrator->GetModulesForEntry('OpenPgpWebclient')
                                    )
                                ];
                                //passing data to AppData throughGetSettings. GetSettings will be called in $oApiIntegrator->buildBody
                                /** @var \Aurora\Modules\FilesWebclient\Module $oFilesWebclientModule */
                                $oFilesWebclientModule = \Aurora\System\Api::GetModule('FilesWebclient');
                                if ($oFilesWebclientModule) {
                                    $sUrl = (bool) $oFilesWebclientModule->oModuleSettings->ServerUseUrlRewrite ? '/download/' : '?/files-pub/';
                                    $this->aPublicFileData = [
                                        'Url'	=> $sUrl . $aData['__hash__'],
                                        'Hash'	=> $aData['__hash__']
                                    ];
                                    if ($bSelfDestructingEncryptedMessage) {
                                        $this->aPublicFileData['Subject'] =  $aData['Subject'];
                                        $this->aPublicFileData['Data'] =  $aData['Data'];
                                        $this->aPublicFileData['PgpEncryptionMode'] =  $aData['PgpEncryptionMode'];
                                        $this->aPublicFileData['RecipientEmail'] =  $aData['RecipientEmail'];
                                        $this->aPublicFileData['ExpireDate'] = isset($aData['ExpireDate']) ? $aData['ExpireDate'] : null;
                                    } elseif ($bIsEncyptedFile) {
                                        $this->aPublicFileData['PgpEncryptionMode'] = $aData['PgpEncryptionMode'];
                                        $this->aPublicFileData['PgpEncryptionRecipientEmail'] = isset($aData['RecipientEmail']) ? $aData['RecipientEmail'] : '';
                                        $this->aPublicFileData['Size'] =  \Aurora\System\Utils::GetFriendlySize($aData['Size']);
                                        $this->aPublicFileData['Name'] =  $aData['Name'];
                                        $this->aPublicFileData['ParanoidKeyPublic'] = $aFileInfo->ExtendedProps['ParanoidKeyPublic'];
                                        $this->aPublicFileData['InitializationVector'] = $aFileInfo->ExtendedProps['InitializationVector'];
                                    } elseif ($bIsUrlFile) {
                                        $mFile = $this->oFilesdecorator->getRawFileData($aData['UserId'], $aData['Type'], $aData['Path'], $aData['Name'], $aData['__hash__'], 'view');
                                        if (\is_resource($mFile)) {
                                            $mFile = \stream_get_contents($mFile);
                                        }
                                        $aUrlFileInfo = \Aurora\System\Utils::parseIniString($mFile);
                                        if ($aUrlFileInfo && isset($aUrlFileInfo['URL'])) {
                                            $sUrl = $aUrlFileInfo['URL'];
                                            $sFileName = basename($sUrl);
                                            $sFileExtension = \Aurora\System\Utils::GetFileExtension($sFileName);
                                            if (\strtolower($sFileExtension) === 'm3u8') {
                                                $this->aPublicFileData['Url'] = $sUrl;
                                                $this->aPublicFileData['Name'] =  $sFileName; #$aData['Name'];
                                                $this->aPublicFileData['IsSecuredLink'] = isset($aData['Password']);
                                                $this->aPublicFileData['IsUrlFile'] =  true;
                                            }
                                        }
                                    } else {//encrypted link
                                        $this->aPublicFileData['Size'] =  \Aurora\System\Utils::GetFriendlySize($aData['Size']);
                                        $this->aPublicFileData['Name'] =  $aData['Name'];
                                        $this->aPublicFileData['IsSecuredLink'] = isset($aData['Password']);
                                        $this->aPublicFileData['ExpireDate'] = isset($aData['ExpireDate']) ? $aData['ExpireDate'] : null;
                                    }

                                    $mResult = \strtr(
                                        $sResult,
                                        [
                                            '{{AppVersion}}' => \Aurora\System\Application::GetVersion(),
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
        ) {
            $oUser = \Aurora\System\Api::getUserById($aArgs['UserId']);
            $iAuthenticatedUserId = \Aurora\System\Api::getAuthenticatedUserId();
            if ($oUser instanceof \Aurora\Modules\Core\Models\User
                && $iAuthenticatedUserId === $aArgs['UserId']
            ) {
                $sID = \Aurora\Modules\Min\Module::generateHashId([$oUser->PublicId, $oItem->TypeStr, $oItem->Path, $oItem->Name]);
                $mMin = \Aurora\Modules\Min\Module::getInstance()->GetMinByID($sID);
                if (!empty($mMin['__hash__'])) {
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
        if (!empty($aArgs['Url'])) {
            $sUrl = $aArgs['Url'];
            if ($sUrl) {
                $sFileName = basename($sUrl);
                $sFileExtension = \Aurora\System\Utils::GetFileExtension($sFileName);
                if (\strtolower($sFileExtension) === 'm3u8') {
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

    public function onBeforeDeleteExpiredHashes(&$aArgs, &$mResult)
    {
        $this->aHashes = [];
        if (isset($aArgs['Time']) && $aArgs['Time'] > 0) {
            $this->aHashes = \Aurora\Modules\Min\Models\MinHash::whereNotNull('ExpireDate')->where('ExpireDate', '<=', $aArgs['Time'])->get()->all();
        }
    }

    public function onAfterDeleteExpiredHashes(&$aArgs, &$mResult)
    {
        foreach ($this->aHashes as $hash) {
            $data = \json_decode($hash['Data'], true);
            if (isset($data['UserId'], $data['Type'], $data['Path'], $data['Name'])) {
                \Aurora\Modules\Files\Module::Decorator()->UpdateExtendedProps(
                    $data['UserId'],
                    $data['Type'],
                    $data['Path'],
                    $data['Name'],
                    ['ParanoidKeyPublic' => null]
                );
            }
        }
        $this->aHashes = [];
    }

    public function onBeforeGetPublicFiles(&$aArgs, &$mResult)
    {
        /** @var \Aurora\Modules\Min\Module $oMinDecorator */
        $oMinDecorator =  \Aurora\Api::GetModuleDecorator('Min');
        if ($oMinDecorator) {
            $mMin = $oMinDecorator->GetMinByHash($aArgs['Hash']);
            if (!empty($mMin['__hash__'])) {
                if (isset($mMin['ExpireDate'])) {
                    $iExpireDate = (int) $mMin['ExpireDate'];
                    if ($iExpireDate > 0 && time() > $iExpireDate) {
                        $mResult = false;
                        return true;
                    }
                }
            }
        }
    }

    public function onBeforeRunEntry(&$aArgs, &$mResult)
    {
        if (isset($aArgs['EntryName']) && strtolower($aArgs['EntryName']) === 'download-file') {
            $sHash = (string) \Aurora\System\Router::getItemByIndex(1, '');
            $aValues = \Aurora\System\Api::DecodeKeyValues($sHash);
            if (isset($aValues['PublicHash'])) {
                /** @var \Aurora\Modules\Min\Module $oMinDecorator */
                $oMinDecorator =  \Aurora\Api::GetModuleDecorator('Min');
                if ($oMinDecorator) {
                    $mMin = $oMinDecorator->GetMinByHash($aValues['PublicHash']);
                    if (!empty($mMin['__hash__'])) {
                        if (isset($mMin['ExpireDate'])) {
                            $iExpireDate = (int) $mMin['ExpireDate'];
                            if ($iExpireDate > 0 && time() > $iExpireDate) {
                                $this->oHttp->StatusHeader(403);
                                exit();
                            }
                        }
                    }
                }
            }
        }
    }
}
