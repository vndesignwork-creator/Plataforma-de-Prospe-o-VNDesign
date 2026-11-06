<?php
// Ao apagar o plugin: sai também o que guardou.
if (!defined('WP_UNINSTALL_PLUGIN')) {
	exit;
}
delete_option('vnd_fa_options');
delete_transient('vnd_fa_check');
