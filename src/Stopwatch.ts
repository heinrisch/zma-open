export class Stopwatch {
    private startTime: number;
    private laps: { name: string, time: number }[] = [];
    private name: string;

    constructor(name: string) {
        this.name = name;
        this.startTime = Date.now();
    }

    start() {
        this.startTime = Date.now();
    }

    lap(name: string) {
        const endTime = Date.now();
        this.laps.push({ name, time: endTime - this.startTime });
        this.startTime = endTime;
    }

    stop() {
        this.lap('stop');
    }

    printResults() {
        let results = `Results for ${this.name}:\n`;
        let total = 0;
        this.laps.forEach(lap => {
            results += `Lap ${lap.name}: ${lap.time}ms\n`;
            total += lap.time;
        });
        results += `Total: ${total}ms`;
        console.log(results);
    }
}