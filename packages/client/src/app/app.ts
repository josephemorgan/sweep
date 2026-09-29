import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FORMAT_VERSION } from '@sweep/core';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
})
export class App {
  protected readonly formatVersion = FORMAT_VERSION;
}
