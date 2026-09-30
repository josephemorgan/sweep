import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { UpdatePrompt } from './pwa/update-prompt';
import { ToastHost } from './shared/toast-host';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastHost, UpdatePrompt],
  template: `<app-update-prompt /><router-outlet /><app-toast-host />`,
})
export class App {}
