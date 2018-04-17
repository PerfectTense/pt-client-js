# pt-client

A Node.js app used to interact with the Perfect Tense API.

All asynchronous operations are performed using Promises.

## Authentication

Most of the Perfect Tense API endpoints require the following two authentication tokens to be sent in the header of requests.

### App Key

Every request from your integration must be sent with an `App key`, which is obtained upon registering your integration [here](https://app.perfecttense.com/api).

This token allows us to verify the source of all API requests.

### Api Key

Every user, upon creating a Perfect Tense account, immediately receives an `Api key` (found [here](https://app.perfecttense.com/api)).

While the `App key` is used to verify the source of a request, an `Api key` is used to verify that the request is sent on behalf of a user whose account is in good standing and is below their daily request limit.

## Installing

Using npm:
```
$ npm install perfecttense --save
```

## Initializing

Once you have obtained an `App key` [here](https://app.perfecttense.com/api), you can initialize a pt-client object and begin interacting with our API.

```
const ptClient = require('pt-client')

// Configure app key
ptClient.initialize({
    appKey: process.env.PT_APP_KEY
})

```

## Submitting a Job

Most interaction with the Perfect Tense API will use the `/correct` endpoint. Every request sent to this endpoint specifies an array call `responseType`, which is an array of response types to receive. Please see our [API documentation](https://www.perfecttense.com/docs/#introduction) for a description of the available response types. By default, this library will request all available response types.

Use the provided `submitJob` function to handle this interaction with the `/correct` endpoint, which returns a Promise containing the result.

Note that while the `ptClient` object was configured with the registered `App key`, individual API requests must still provide the additional `API key` authentication token.


```
function ptSuccess(result) {
	// Print the current text of the result (the original text submitted)
	console.log(ptClient.getCurrentText(result))
}

function ptFailure(error) {
	switch (error.status) {

		// User's API key is invalid/expired
		case 401:
			handleBadApiKey()
			break

		// User is over their daily API limit
		case 403:
			handleOverApiLimit()
			break

		// Other error - see API documentation
		default:
			handleOtherError()
	}
}

ptClient.submitJob([text], [user's API Key]).then(ptSuccess, ptFailure)

```

## Get Usage Statistics

Users have a limited number of daily requests. Using our `/usage` endpoint, you may fetch usage statistics on behalf of users at any time.

```
const usage = ptClient.getUsage([User's API key])

const numReqRemaining = usage.apiRemainToday
```

## Interaction With Result

### Interactive Editor

The interactive editor is the recommended way to interact with a Perfect Tense result. 

You can instantiate an interactive editor as follows:

```
function ptSuccess(result) {
	const intEditor = ptClient.interactiveEditor({
		data: result,
		apiKey: [API key],
		ignoreNoReplacement: true // Ignore all suggestions that are pure comments ("This sentence is a fragment", etc.)
	})
}

ptClient.submitJob([text], [API key]).then(ptSuccess)

```

If the interactive editor's API is not sufficient for your use-case, there are additional utilities provided directly through the pt-client.

When operating independently on the result object, please note that not all corrections are available at all times. Some corrections are dependent on others.

For example:

```
Input: "He hzve be there before"

Transformation 1: "hzve" -> "have" (spelling error)
Transformation 2: "have be" -> "has been" (verb agreement error)
```

Transformation 2 is not available until Transformation 1 has been accepted. If Transformation 1 is rejected, Transformation 2 will be lost.

The interactive editor will manage this state information for you.

When in doubt, there is a utility function to determine if a transformation is currently available or not:

```
// Returns true if the transform is currently available in the sentence, else false
intEditor.canMakeTransform(transform)
```

### Iterate Through Corrections

Corrections may or may not be available at all times. Some are dependent on others, and may become invalid if certain corrections are accepted or rejected. All of this state information is managed for you by the interactive editor. Simply use the `hasNextTransform()` and `getNextTransform()` function calls to iterate through all available corrections.

```
while (intEditor.hasNextTransform()) {

	// Get the next available transformation
	const nextTransform = intEditor.getNextTransform()

	if (...) {
		// Accept the correction
		intEditor.acceptCorrection(nextTransform)
	} else {
		// Reject the correction
		intEditor.rejectCorrection(nextTransform)
	}
}

```

### Print the Current State

While iterating through and accepting or rejecting corrections, the state of the text will change. At any time, call `getCurrentText()` to see the current state.

```
// Re-construct the current state of the job (considering accepted/rejected corrections)
const currentText = intEditor.getCurrentText()

console.log(currentText)
```

### Retrieve Character Offsets

Many applications will need to reference the character offset of corrections. These can be recovered using the `getSentenceOffset` and `getTransformOffset` utilities as follows:

```
var sentenceIndex

// Iterate over all sentences in the job
for (sentenceIndex = 0; sentenceIndex < intEditor.getNumSentences(); sentenceIndex++) {
	
	// Fetch the sentence at the specified index
	const sentence = intEditor.getSentence(sentenceIndex)

	var transformIndex

	// Iterate over all transformations (corrections) in the job
	for (transformIndex = 0; transformIndex < ptClient.getNumTransformations(sentence); transformIndex++) {

		// Fetch the transformation at the specified index
		const transformation = ptClient.getTransformationAtIndex(sentence, transformIndex)

		// Find the sentence's offset relative to the start of the entire body of text
		const sentenceOffset = intEditor.getSentenceOffset(sentence)

		// Find the transformation's offset relative to the start of the sentence
		const transformOffset = intEditor.getTransformOffset(transformation)

		// Find the transformation's offset relative to the start of the entire body of text
		const totalTransformOffset = sentenceOffset + transformOffset

		// Find the length of the text affected by this transformation
		const transformationLength = intEditor.getAffectedText(transformation).length

		highlight(index = totalTransformOffset, length = transformationLength)
	}
}

```
### Grammar Score

By default, the Perfect Tense client will fetch a numerical grammar score for the text (0 - 100). This can be recovered as follows:

```
const grammarScore = intEditor.getGrammarScore()
```

## API Documentation

See our [API documentation](https://www.perfecttense.com/docs/#introduction) for more information.