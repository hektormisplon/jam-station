'use strict';

const Rx = require('rx');
const $ = Rx.Observable;

const numberToNote = number => ({
	key: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][number - parseInt(number / 12, 10) * 12],
	octave: parseInt(number / 12, 10),
	number
});

const parseMidiMsg = event => {
	// Mask off the lower nibble (MIDI channel, which we don't care about)

	const status = event.data[0] & 0xf0;
	const binary = event.data[0].toString(2);
	const channel = event.data[0] - status + 1;
	let msg = {};

	switch (binary.slice(0, 4)) {
		// noteoff
		case "1000":
			msg = {
				state: 'noteOff',
				note: numberToNote(event.data[1])
			};
			break;
		// noteon
		case "1001":
			msg = (event.data[2] !== 0) // if velocity != 0, this is a note-on message
				? {
					state: 'noteOn',
					note: numberToNote(event.data[1]),
					velocity: parseFloat((event.data[2] / 127).toFixed(2))
				}
				: { // if velocity == 0, fall thru: it's a note-off.	MIDI's weird, ya'll.
					state: 'noteOff',
					note: numberToNote(event.data[1])
				};
			break;
		// pitch wheel
		case "1110":
			msg = {
				state: 'pitchBend',
				pitchValue: (event.data[2] === 64) ? 0 : parseFloat((event.data[2] / 63.5 - 1).toFixed(2))
			};
			break;
		// controller
		case "1011":
			msg = {
				state: "controller",
				controller: event.data[1],
				value: parseFloat((event.data[2] / 127).toFixed(2))
			};
			break;
		default:
			msg = {
				state: false
			};
			break;
	}

	return Object.assign({}, msg, {
		binary,
		status,
		channel,
		data: event.data
	});
};
//
// const hookUpMIDIInput = midiAccess => {
// 	var haveAtLeastOneDevice = false;
// 	var inputs = midiAccess.inputs.values();
// 	for (var input = inputs.next(); input && !input.done; input = inputs.next()) {
// 		input.value.onmidimessage = MIDIMessageEventHandler;
// 		haveAtLeastOneDevice = true;
// 	}
// };

// const onMIDIInit = midi => {
// 	hookUpMIDIInput(midi);
// 	midi.onstatechange = hookUpMIDIInput;
// };

// const onMIDIReject = err =>
// 	console.log(err, 'The MIDI system failed to start.');

// (navigator.requestMIDIAccess)
//		&& navigator.requestMIDIAccess().then(onMIDIInit, onMIDIReject);

const parseAccess = access => {
	let inputs = [];
	let outputs = [];
	access.inputs.forEach(input => inputs.push(input));
	access.outputs.forEach(output => outputs.push(output));
	return {access, inputs, outputs};
};

const init = () => {
	const access$ = $.fromPromise(navigator.requestMIDIAccess())
		.map(parseAccess);

	const state$ = access$.flatMap(
		({access}) => $.fromEvent(access, 'onstatechange')
			.map(state => ({access, state}))
	);

	const msg$ = access$.flatMap(
		({access, inputs}) => inputs.reduce(
				(msgStream, input) => msgStream.merge(
					$.fromEventPattern(h => {
						input.onmidimessage = h;
					})
					.map(msg => ({access, input, msg}))
				), $.empty()
			)
	);

	return {
		parseMidiMsg,
		access$,
		state$,
		msg$
	};
};

module.exports = init;
