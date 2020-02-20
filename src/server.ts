import mqtt, { IClientOptions } from 'mqtt';

import { MqttHelper } from './helper';
import { SmartDisplayController } from './smart-display-controller';
import { App } from './apps/app';
import { TimeApp } from './apps/time';
import { RoomWeatherApp } from './apps/room-weather';
import { CityWeatherApp } from './apps/city-weather';

export class Server {
    private readonly client: mqtt.Client;
    private readonly apps: App[] = [];
    private readonly controller: SmartDisplayController;

    private interval: NodeJS.Timeout | null = null;
    private currentAppIndex = 0;
    private appIterations = 0;

    constructor(settings: any) {
        const { server, username, password } = settings.mqtt;
        const clientOptions: IClientOptions = {
            username,
            password
        };

        this.client = mqtt
            .connect(server, clientOptions)
            .subscribe('smartDisplay/server/in/#')
            .on('message', (topic, message) => {
                if (!topic.startsWith('smartDisplay/server/in/')) {
                    return;
                }

                const lastPart = MqttHelper.getLastTopicPart(topic);
                this.processIncomingMessage(lastPart, message.toString());
            })
            .on('error', error => {
                console.error('MQTT', error);
            });

        this.controller = new SmartDisplayController(this.client);

        this.loadApps(settings.apps);
    }

    private processIncomingMessage(
        command: string | null,
        message: string
    ): void {
        if (command == null) {
            return;
        }

        console.debug('server cmd', command, message);

        switch (command) {
            case 'power': {
                if (message === 'on' || message === 'off') {
                    const powerOn = message === 'on' ? true : false;

                    console.debug('switch power-status', powerOn);

                    this.controller.power(powerOn);

                    if (powerOn) {
                        this.startInterval();
                    } else {
                        this.stopInterval();
                    }
                }

                break;
            }
        }
    }

    private loadApps(settings: any): void {
        const timeApp = new TimeApp(this.controller);
        const roomWeather = new RoomWeatherApp(this.controller);
        const cityWeather = new CityWeatherApp(
            this.controller,
            settings.cityWeather
        );
        this.apps.push(...[timeApp, roomWeather, cityWeather]);
    }

    run(): void {
        this.client.publish('smartDisplay/server/out', 'started');

        this.startInterval();
    }

    private startInterval(): void {
        console.debug('startInterval()');

        this.appIterations = 0;

        this.renderApp();

        this.interval = setInterval(() => {
            if (this.client.connected) {
                this.renderApp();

                if (this.appIterations >= 15) {
                    this.nextApp();
                }
            } else {
                console.error('client not connected');
            }
        }, 1000);
    }

    private stopInterval(): void {
        console.debug('stopInterval()');

        if (this.interval == null) {
            return;
        }

        clearInterval(this.interval);
    }

    private nextApp(): void {
        this.appIterations = 0;
        this.currentAppIndex++;

        if (this.currentAppIndex >= this.apps.length) {
            this.currentAppIndex = 0;
        }

        const app = this.apps[this.currentAppIndex];
        console.debug('next app', app.name);

        app.reset();

        if (!app.isReady) {
            this.nextApp();
        }
    }

    private renderApp(): void {
        const app = this.apps[this.currentAppIndex];

        if (app.shouldRerender) {
            this.controller.clear();
            app.render();
            this.controller.show();
        }

        this.appIterations++;
    }

    shutdown(): void {
        console.debug('shutdown');
        this.controller.destroy();
    }
}
