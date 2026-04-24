<?php

declare(strict_types=1);

use App\Http\Controllers\Auth\BackChannelLogoutController;
use App\Http\Controllers\Auth\CallbackController;
use App\Http\Controllers\Auth\DashboardController;
use App\Http\Controllers\Auth\LoginController;
use App\Http\Controllers\Auth\LogoutController;
use App\Http\Controllers\System\HealthController;
use App\Http\Controllers\System\HomeController;
use Illuminate\Support\Facades\Route;

Route::get('/', HomeController::class);
Route::get('/health', HealthController::class);
Route::get('/dashboard', DashboardController::class);
Route::get('/auth/login', LoginController::class);
Route::get('/auth/callback', CallbackController::class);
Route::post('/auth/logout', LogoutController::class);
Route::post('/auth/backchannel/logout', BackChannelLogoutController::class);
