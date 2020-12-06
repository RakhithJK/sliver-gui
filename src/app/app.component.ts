/*
  Sliver Implant Framework
  Copyright (C) 2019  Bishop Fox
  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.
  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.
  You should have received a copy of the GNU General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { Component, OnInit, OnDestroy, Inject } from '@angular/core';
import { OverlayContainer } from '@angular/cdk/overlay';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { Events } from 'sliver-script/lib/events';
import * as clientpb from 'sliver-script/lib/pb/clientpb/client_pb';

import { Version } from '../environments/version';
import { EventsService, Notification } from './providers/events.service';
import { ClientService, Platforms, Settings, Themes } from './providers/client.service';


@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit, OnDestroy {

  private readonly LIGHT_CSS = 'light-theme';
  private readonly DARK_NO_GLASS_CSS = 'dark-theme-no-glass';
  private readonly CSS_THEMES = [this.LIGHT_CSS, this.DARK_NO_GLASS_CSS];
  
  mainWindow = window.location.origin == "app://sliver";
  settings: Settings;
  settingsSub: Subscription;

  constructor(private _router: Router,
              private _overlayContainer: OverlayContainer,
              private _eventsService: EventsService,
              private _clientService: ClientService,
              private _snackBar: MatSnackBar,
              public dialog: MatDialog) 
  {
    if (this.mainWindow) {
      this.initAlerts();
    }
  }

  ngOnInit(): void {
    this.fetchSettings();
    this.settingsSub = this._clientService.settings$.subscribe((settings: Settings) => {
      this.settings = settings;
      this.setTheme();
    });
  }

  ngOnDestroy(): void {
    this.settingsSub?.unsubscribe();
  }

  async fetchSettings() {
    this.settings = await this._clientService.getSettings();
    this.setTheme();
  }

  async setTheme() {
    console.log(`Set theme to: ${this.settings.theme}`);
    const platform = await this._clientService.getPlatform();
    switch(this.settings.theme) {
      case Themes.Auto:
        this.setAutoTheme();
        break;
      case Themes.Dark:
        platform === Platforms.MacOS ? this.setDarkTheme() : this.setDarkThemeNoGlass();
        break;
      case Themes.DarkNoGlass:
        this.setDarkThemeNoGlass();
        break;
      case Themes.Light:
        this.setLightTheme();
        break;
      default:
        this.setAutoTheme();
    }
  }

  async setAutoTheme(): Promise<void> {
    const isDark = await this._clientService.getSystemThemeIsDark();
    const platform = await this._clientService.getPlatform();
    if (isDark) {
      if (platform === Platforms.MacOS) {
        this.setDarkTheme();
      } else {
        this.setDarkThemeNoGlass();
      }
    } else {
      this.setLightTheme();
    }
  }

  clearThemes(): void {
    this.CSS_THEMES.forEach((css_theme) => {
      document.body.classList.remove(css_theme);
      this._overlayContainer.getContainerElement().classList.remove(css_theme);
    });
  }

  setDarkTheme(): void {
    this.clearThemes(); // Dark theme w/glass is default
  }

  setDarkThemeNoGlass(): void {
    this.clearThemes();
    document.body.classList.add(this.DARK_NO_GLASS_CSS);
    this._overlayContainer.getContainerElement().classList.add(this.DARK_NO_GLASS_CSS);
  }

  setLightTheme(): void {
    this.clearThemes();
    document.body.classList.add(this.LIGHT_CSS);
    this._overlayContainer.getContainerElement().classList.add(this.LIGHT_CSS);
  }

  initAlerts() {
    this._eventsService.sessions$.subscribe((event: clientpb.Event) => {
      const eventType = event.getEventtype();
      switch (eventType) {
        case Events.SessionConnected:
          this.sessionConnectedAlert(event.getSession());
          break;
        case Events.SessionDisconnected:
          this.sessionDisconnectedAlert(event.getSession());
          break;
      }
    });

    this._eventsService.players$.subscribe((event: clientpb.Event) => {
      const eventType = event.getEventtype();
      switch (eventType) {
        case Events.ClientJoined:
          this.playerAlert('joined', event.getClient());
          break;
        case Events.ClientLeft:
          this.playerAlert('left', event.getClient());
          break;
      }
    });

    this._eventsService.events$.subscribe((event: clientpb.Event) => {
      const eventType = event.getEventtype();
      switch (eventType) {
        case Events.JobStopped:
          this.jobStoppedAlert(event.getJob());
          break;
      }
    });

    this._eventsService.notifications$.subscribe((notify: Notification) => {
      this.notificationAlert(notify.message, notify.buttonLabel, notify.seconds, notify.callback);
    });

    // Back menu event
    this._eventsService.menu$.pipe(
      filter(event => event.button === 'back')
    ).subscribe(() => {
      window.history.back();
    });

    // Forward menu event
    this._eventsService.menu$.pipe(
      filter(event => event.button === 'forward')
    ).subscribe(() => {
      window.history.forward();
    });


    // About menu event
    this._eventsService.menu$.pipe(
      filter(event => event.button === 'about')
    ).subscribe(() => {
      this.aboutDialog();
    });
  }

  notificationAlert(message: string, buttonLabel: string, seconds: number, callback: Function|null = null) {
    const snackBarRef = this._snackBar.open(message, buttonLabel, {
      duration: seconds * 1000,
    });
    if (callback !== null) {
      snackBarRef.onAction().subscribe(() => {
        callback();
      });
    }
  }

  playerAlert(action: string, client: clientpb.Client) {
    this._snackBar.open(`${client.getOperator()?.getName()} has ${action} the game!`, 'Dismiss', {
      duration: 5000,
    });
  }

  jobStoppedAlert(job: clientpb.Job) {
    this._snackBar.open(`Job #${job.getId()} (${job.getProtocol()}/${job.getName()}) has stopped.`, 'Dismiss', {
      duration: 5000,
    });
  }

  sessionConnectedAlert(session: clientpb.Session) {
    const snackBarRef = this._snackBar.open(`Session #${session.getId()} opened`, 'Interact', {
      duration: 5000,
    });
    snackBarRef.onAction().subscribe(() => {
      this._router.navigate(['sessions', session.getId()]);
    });

    const _ = new Notification('Sliver', {
      body: `Session #${session.getId()} opened`
    });
  }

  sessionDisconnectedAlert(session: clientpb.Session) {
    this._snackBar.open(`Lost session #${session.getId()}`, 'Dismiss', {
      duration: 5000,
    });
  }

  aboutDialog() {
    this.dialog.open(AboutDialogComponent);
  }

}


@Component({
  selector: 'app-about-dialog',
  templateUrl: 'about.dialog.html',
})
export class AboutDialogComponent {

  version = Version;

  constructor(public dialogRef: MatDialogRef<AboutDialogComponent>,
              @Inject(MAT_DIALOG_DATA) public data: any) { }

  onNoClick(): void {
    this.dialogRef.close();
  }

}
