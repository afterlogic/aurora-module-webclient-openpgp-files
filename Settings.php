<?php
/**
 * This code is licensed under AGPLv3 license or Afterlogic Software License
 * if commercial version of the product was purchased.
 * For full statements of the licenses see LICENSE-AFTERLOGIC and LICENSE-AGPL3 files.
 */

namespace Aurora\Modules\OpenPgpFilesWebclient;

use Aurora\System\SettingsProperty;

/**
 * @property bool $Disabled
 * @property bool $EnableSelfDestructingMessages
 * @property bool $EnablePublicLinkLifetime
 * @property array $AvailableFor
 */

class Settings extends \Aurora\System\Module\Settings
{
    protected function initDefaults()
    {
        $this->aContainer = [
            "Disabled" => new SettingsProperty(
                false,
                "bool",
                null,
                "Setting to true disables the module",
            ),
            "EnableSelfDestructingMessages" => new SettingsProperty(
                true,
                "bool",
                null,
                "Enables feature of self-destructing messages",
            ),
            "EnablePublicLinkLifetime" => new SettingsProperty(
                true,
                "bool",
                null,
                "Enables feature of public link expiration",
            ),
            "AvailableFor" => new SettingsProperty(
                [
                    "FilesWebclient"
                ],
                "array",
                null,
                "Automatically provide this feature if one of the listed modules is requested by the entry point",
            ),
        ];
    }
}
