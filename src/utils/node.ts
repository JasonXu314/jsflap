import { Entity, type Metadata } from './entity';
import { Point } from './point';
import type { RenderEngine } from './renderEngine';

export interface NodeData {
	label: string;
	start: boolean;
	end: boolean;
}

export interface DehydratedNode extends NodeData {
	id: number;
	type: 'NODE';
	position: [number, number];
}

export class DummyNode extends Entity {
	public update(metadata: Metadata): void {
		if (metadata.mouse?.position) {
			this.position = metadata.mouse.position.clone();
		}
	}

	public render(renderEngine: RenderEngine): void {
		renderEngine.fillCircle(this.position, 37.5, 'white');
		renderEngine.circle(this.position, 37.5);
	}

	public selectedBy(point: Point): boolean {
		return point.distanceTo(this.position) <= 37.5;
	}

	public serialize(): never {
		throw new Error('Attempting to serialize a placeholder entity');
	}
}

export class Node extends Entity {
	constructor(public label: string, public start: boolean, public end: boolean) {
		super();
	}

	public update(metadata: Metadata): void {
		if (metadata.selected && metadata.mouse && metadata.mouse.down) {
			this.position = this.position.add(metadata.mouse.delta);
		}
	}

	public render(renderEngine: RenderEngine, metadata: Metadata): void {
		renderEngine.fillCircle(this.position, 37.5, 'white');

		if (metadata.active) {
			renderEngine.fillCircle(this.position, 37.5, 'rgba(255, 255, 50, 0.5)');
		} else if (metadata.selected) {
			renderEngine.fillCircle(this.position, 37.5, 'rgba(200, 200, 255, 0.5)');
		}

		renderEngine.circle(this.position, 37.5);

		if (this.end) {
			renderEngine.circle(this.position, 34);
		}

		if (this.start) {
			renderEngine.shape([this.position.add(new Point(-37.5)), this.position.add(new Point(-60, 15)), this.position.add(new Point(-60, -15))], true);
		}

		renderEngine.text(this.position, this.label);
	}

	public selectedBy(point: Point): boolean {
		return point.distanceTo(this.position) <= 37.5;
	}

	public serialize(id: number): DehydratedNode {
		return {
			id,
			type: 'NODE',
			position: [this.position.x, this.position.y],
			label: this.label,
			start: this.start,
			end: this.end
		};
	}

	public static deserialize({ type, label, position, start, end }: DehydratedNode): Node {
		if (type !== 'NODE') {
			throw new Error(`Attempting to deserialize ${type} as node`);
		}

		const entity = new Node(label, start, end);
		const [x, y] = position;
		entity.position = new Point(x, y);

		return entity;
	}
}

