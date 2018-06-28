/**
 * This is a client-side library to interact with the Perfect Tense API using the "rulesApplied" response type.
 *
 * Note: The word "transformation" is used interchangably with "correction" in all comments. Both refer to a
 * grammatical mistake found in the document (also interchangable with "job")
 *
 */
/*********************************************************************
                        Init Axios
**********************************************************************/
const axios = require('axios').create()
const pt = this

// don't actually set axios baseUrl to avoid conflicting with other usage
const PT_BASE_URL = 'https://api.perfecttense.com'

/*********************************************************************
                    Perfect Tense Specific
**********************************************************************/
this.TRANSFORM_STATUS_ACCEPTED = "accept"
this.TRANSFORM_STATUS_REJECTED = "reject"
this.TRANSFORM_STATUS_CLEAN = "clean"
this.ALL_RESPONSE_TYPES = ["rulesApplied", "grammarScore", "corrected"]

module.exports = this

this.appKey = ""
this.verbose = true
this.persist = true

/**
 * Test the validity of the parameter API key
 *     
 * @param {string} apiKey           The API key to test
 *
 * @return {boolean}                True if the API key is valid, else false
 */
this.apiKeyIsValid = function(apiKey) {

    const payload = {
        method: 'GET',
        url: PT_BASE_URL + "/testAuth",
        headers: {
            'Authorization': apiKey,
            'Content-Type': 'application/json'
        }
    }

    function apiSuccess(response) {
        return true
    }

    function apiFailure(response) {
        return false
    }

    return axios(payload).then(apiSuccess, apiFailure)
}

/*********************************************************************
                Interaction With Perfect Tense API
**********************************************************************/

/*
 * Submit text to Perfect Tense, receiving specified responseTypes in result.
 *
 * @param {string} text             Text to be submitted
 * @param {string} apiKey           The user's API key
 * @param {Object} options          Options such as protected text. Defaults to options set during initialization
 * @param {Object} responseType     Array of response types. Defaults to responseType set during initialization
 *
 * @return {Object}                 Promise containing the job result
 */


/*
 * Submit text to Perfect Tense, receiving specified responseTypes in result.
 *
 * @param {string} text             Text to be submitted
 * @param {string} apiKey           The user's API key
 * @param {Object} options          Options such as protected text. Defaults to options set during initialization
 * @param {Object} responseType     Array of response types. Defaults to responseType set during initialization
 *
 * @return {Object}                 Promise containing the job result
 */
this.submitJob = function(text, apiKey, options, responseType) {
    const data = {
        text: text,
        responseType: responseType || pt.responseType,
        options: options || pt.options // can overwrite in individual requests, or use default
    }

    if (pt.verbose) {
        console.log("Submitting job:")
        console.log(data)
    }

    return new Promise(function(resolve, reject) {
        submitToPT(data, apiKey, "/correct")
            .then(function(res) {
                if (pt.verbose) {
                    console.log("Received response from PT:")
                    console.log(res.data)
                }

                if (res.status == 201) {
                    pt.setMetaData(res.data)
                    resolve(res.data)
                } else reject(res)

            }).catch(function(error) {
                if (pt.verbose) {
                    console.log("Error contacting pt:")
                    console.log(error.response.data)
                }
                reject(error.response)
            })
    })
}

/**
 * Generate an App key for this integration (alternatively, use our UI here: https://app.perfecttense.com/api).
 *
 * @param {String} $apiKey              The API key to register this app under (likely your own)
 * @param {String} $name                The name of this app
 * @param {String} $description         The description of this app (minimum 50 characters)
 * @param {String} $contactEmail        Contact email address for this app (defaults to the email associated with the API key)
 * @param {String} $siteUrl             Optional URL that can be used to sign up for/use this app.
 *
 * @return {String}                     A unique app key
 */
this.generateAppKey = function(apiKey, name, description, contactEmail, siteUrl) {

    const data = {
        name: name,
        description: description,
        contactEmail: contactEmail,
        siteUrl: siteUrl
    }

    return new Promise(function(resolve, reject) {
        submitToPT(data, apiKey, "/generateAppKey")
            .then(function(res) {

                if (!res.data.error) {
                    resolve(res.data)
                } else reject(res)

            }).catch(function(error) {
                reject(error.response)
            })
    })
}

/*********************************************************************
                Interaction With Perfect Tense Result
**********************************************************************/

/**
 * Get the grammar score result of this job.
 *    
 * If the grammar score was requested in the original request, a value from 0.0 to 100.0
 * will be returned. Otherwise, null will be returned.
 *
 *
 * @param {Object} data     Result returned from submitJob
 *
 * @return {number}         The grammar score result to this job
 */
this.getGrammarScore = function(data) {
    return data.grammarScore
}

/**
 * Get API usage statistics from PT
 *
 * @param {String} apiKey     The api key of the user you are requesting usage statistics for
 *
 * @return {Object}           The user's usage statistics
 */
this.getUsage = function(apiKey) {

    const payload = {
        method: 'GET',
        url: PT_BASE_URL + "/usage",
        headers: {
            'Authorization': apiKey
        }
    }

    return axios(payload)
}


/**
 * Returns an interactive editor used to work through accepting/rejecting all
 * corrections returned by Perfect Tense.
 *
 * This editor will handle tracking state information such as which transformations are avilable
 * at any given time, and is the recommended way to interact with a result.
 *
 *
 * @param {Object} config.data                          Result returned from submitJob
 * @param {Object} [config.apiKey]                      Optional API Key associated with this job (to track transformation accept/reject/clean statuses)
 * @param {Object} [config.ignoreNoReplacement=false]   Optionally ignore transformations that are comments (i.e. "This sentence is a fragment")            
 *
 * @return {Object}                                     Interactive Editor
 */
this.interactiveEditor = function(config) {

    const data = config.data
    const apiKey = config.apiKey
    const ignoreNoReplacement = config.ignoreNoReplacement

    // All functions assume that this metadata has been set when interacting with corrections
    if (!data.hasMeta) {
        pt.setMetaData(data)
    }

    // Transformations from each sentence flattened into one array for easier indexing
    const flattenedTransforms = [].concat.apply([],
        data.rulesApplied.map(function(sentence) {
            return sentence.transformations
        })
    )

    // Stack tracking accepted/rejected transformations
    const transformStack = flattenedTransforms.filter(transform => !pt.isClean(transform))
    var transStackSize = transformStack.length

    // Cache of available transformations in current state
    var allAvailableTransforms = null

    updateAvailableCache()

    // Updates cache of available transformations (optionally skipping suggestions without replacements)
    function updateAvailableCache() {
        allAvailableTransforms = flattenedTransforms.filter(function(transform) {
            return transform.isAvailable && (!ignoreNoReplacement || transform.hasReplacement)
        })
    }

    const editor = {

        // Get the assigned grammar score
        getGrammarScore: function() {
            return data.grammarScore
        },

        // Accessor for the data
        getData: function() {
            return data
        },

        // Get usage statistics for this user (number of requests remaining, etc.)
        getUsage: function() {
            return pt.getUsage(apiKey)
        },

        // Get the transform at the specified index (relative to the flattened list of all transformations)
        getTransform: function(flattenedIndex) {
            return flattenedTransforms[flattenedIndex]
        },

        // Get the sentence at the specified index
        getSentence: function(sentenceIndex) {
            return pt.getSentence(data, sentenceIndex)
        },

        // Get the sentence containing the specified transform
        getSentenceFromTransform: function(transform) {
            return pt.getSentence(data, transform.sentenceIndex)
        },

        // Get all transforms that are currently valid (their tokensAffected are available in the sentence)
        getAllAvailableTransforms: function() {
            return allAvailableTransforms
        },

        // Returns true if there exists an available, clean transformation
        hasNextTransform: function(ignoreSuggestions) {
        	if (ignoreSuggestions) {
        		return getNextNonSuggestion() != null
        	} else {
        		return allAvailableTransforms.length > 0
        	}  
        },

        // Returns the next available transformation
        getNextTransform: function(ignoreSuggestions) {
        	if (ignoreSuggestions) {
        		return getNextNonSuggestion()
        	} else {
        		return allAvailableTransforms[0]
        	}  
        },

        // Returns a list of all transforms affecting the exact same tokens in the current sentence
        getOverlappingTransforms: function(transform) {
            const sentence = pt.getSentence(data, transform.sentenceIndex)
            const overlappingTransforms = pt.getOverlappingGroup(sentence, transform)

            return overlappingTransforms.filter(function(t) {
                return pt.affectsSameTokens(t, transform)
            })
        },

        // Returns the current text of the job (considering whether transforms have been accepted or rejected)
        getCurrentText: function() {
            return pt.getCurrentText(data)
        },

        // Returns the current text of the sentence (considering whether transforms have been accepted or rejected)
        getCurrentSentenceText: function(sentence) {
            return pt.getCurrentSentenceText(sentence)
        },

        // Accept the transformation and substitute the tokensAdded for the tokensAffected (optionally persisting to database)
        acceptCorrection: function(transform) {

            if (pt.acceptCorrection(data, transform, apiKey)) {
                updateAvailableCache()
                transformStack.push(transform)
                transStackSize += 1
                return true
            }

            return false
        },

        // Reject the transformation (optionally persisting to database)
        rejectCorrection: function(transform) {
            if (pt.rejectCorrection(data, transform, apiKey)) {
                updateAvailableCache()
                transformStack.push(transform)
                transStackSize += 1
                return true
            }

            return false
        },

        // Undo the last transformation action (accept/reject -> clean) (optionally persisting to database)
        undoLastTransform: function() {

            if (transStackSize > 0) {
                const lastTransform = transformStack[transStackSize - 1]

                if (pt.resetCorrection(data, lastTransform, apiKey)) {
                    updateAvailableCache()
                    transformStack.pop()
                    transStackSize -= 1
                    return true
                }
            }

            return false
        },

        canMakeTransform: function(transform) {
            const sentence = pt.getSentence(data, transform.sentenceIndex)
            return pt.canMakeTransform(sentence, transform)
        },

        // Returns true if the last action can be undone, else false
        canUndoLastTransform: function() {

            if (transStackSize > 0) {
                const lastTransform = transformStack[transStackSize - 1]
                const sentence = data.rulesApplied[lastTransform.sentenceIndex]

                return pt.canUndoTransform(sentence, lastTransform)
            }


            return false
        },

        // Returns the last transformation that was interacted with
        getLastTransform: function() {
            return transformStack[transStackSize - 1]
        },

        // Get the character offset of the transformation (relative to the current state of the sentence)
        getTransformOffset: function(transform) {
            return pt.getTransformOffset(data, transform)
        },

        // Get the character offset of the sentence (relative to the current state of the job)
        getSentenceOffset: function(sentence) {
            return pt.getSentenceOffset(data, sentence)
        },

        // Get the tokensAffected as a string
        getAffectedText: function(transform) {
            return pt.getAffectedText(transform)
        },

        // Get the tokensAdded as a string
        getAddedText: function(transform) {
            return pt.getAddedText(transform)
        },

        // Get the original text of the job
        getOriginalText: function() {
            return pt.getOriginalText(data)
        },

        // Get all "clean" transformations (ones that have not been accepted or rejected yet)
        getAllClean: function() {
            return flattenedTransforms.filter(pt.isClean)
        },

        // Get the number of sentences in the job
        getNumSentences: function() {
            return pt.getNumSentences(data)
        },

        getNumTransformations: function() {
            return flattenedTransforms.length
        }
    }

    // private utility to get the next non-suggestion
    function getNextNonSuggestion() {
    	return allAvailableTransforms.find(function(transform) {
	        return !transform.isSuggestion
	    })
    }

    // Execute all transformations available
    editor.applyAll = function(ignoreSuggestions) {
        while (editor.hasNextTransform(ignoreSuggestions)) {
            editor.acceptCorrection(editor.getNextTransform(ignoreSuggestions))
        }
    }

    // Undo all accept/reject actions
    editor.undoAll = function() {
        while (editor.canUndoTransform) {
            editor.undoLastTransform()
        }
    }

    // Get the character offset of the correct relative to the entire document
    editor.getTransformDocumentOffset = function(transform) {
    	const sentence = editor.getSentenceFromTransform(transform)
    	return editor.getSentenceOffset(sentence) + editor.getTransformOffset(transform)
    }

    return editor
}

/**
 * Get the current text of the job, considering transformations that have been accepted or rejected.
 *
 * @param {Object} data     Result returned from submitJob
 *
 * @return {string}         current text of the job    
 */
this.getCurrentText = function(data) {
    return data.rulesApplied.map(pt.getCurrentSentenceText).join("")
}

/**
 * Accepts the transformation and modifies the state of the job to reflect the change
 *
 *
 * @param {Object} data           Result returned from submitJob
 * @param {Object} transform      The transformation to be accepted
 * @param {string} [apiKey]       Optional user API Key to track transformation status (found at https://app.perfecttense.com/home)
 *
 * @return {boolean}              True if successfully accepted, else false
 */
this.acceptCorrection = function(data, transform, apiKey) {
    const sentence = data.rulesApplied[transform.sentenceIndex]

    if (transform.isAvailable) {

        const prevText = pt.getCurrentSentenceText(sentence)
        const offset = pt.getTransformOffset(data, transform)

        makeTransform(sentence, transform)

        transform.status = pt.TRANSFORM_STATUS_ACCEPTED

        if (canPersist()) {
            saveTransformStatus(data, transform, apiKey, prevText, offset)
        }

        return true
    }

    return false
}

/**
 * Rejects the transformation and modifies the state of the job to reflect the change
 *
 *
 * @param {Object} data         Result returned from submitJob
 * @param {Object} transform    The transformation to be rejected
 * @param {string} [apiKey]     Optional user API Key to track transformation status (found at https://app.perfecttense.com/home)
 *
 * @return {boolean}            True if successfully rejected, else false
 */
this.rejectCorrection = function(data, transform, apiKey) {
    const sentence = data.rulesApplied[transform.sentenceIndex]

    if (transform.isAvailable) {

        const prevText = pt.getCurrentSentenceText(sentence)
        const offset = pt.getTransformOffset(data, transform)

        // Rejecting a transformation does not affect which transformations are currently available
        transform.status = pt.TRANSFORM_STATUS_REJECTED
        transform.isAvailable = false

        if (canPersist()) {
            saveTransformStatus(data, transform, apiKey, prevText, offset)
        }

        return true
    }

    return false
}

/**
 * Resets the transformation to "clean" and modifies the state of the job to reflect the change
 *
 *
 * @param {Object} data          Result returned from submitJob
 * @param {Object} transform     The transformation to be reset
 * @param {string} [apiKey]      Optional user API Key to track transformation status (found at https://app.perfecttense.com/home)
 *
 * @return {boolean}             True if successfully reset, else false
 */
this.resetCorrection = function(data, transform, apiKey) {

    const sentence = data.rulesApplied[transform.sentenceIndex]

    if (pt.canUndoTransform(sentence, transform)) {
        undoTransform(sentence, transform)

        transform.status = pt.TRANSFORM_STATUS_CLEAN

        if (canPersist()) {

            const text = pt.getCurrentSentenceText(sentence)
            const offset = pt.getTransformOffset(data, transform)

            saveTransformStatus(data, transform, apiKey, text, offset)
        }

        return true
    }

    return false
}

/*********************************************************************
                 Perfect Tense Result Utilities
**********************************************************************/

/**
 * Returns the number of sentences in the job.
 *
 *
 * @param {Object} data     Result returned from submitJob
 *
 * @return {number}         The number of sentences in the job
 */
this.getNumSentences = function(data) {
    return data.rulesApplied.length
}

/**
 * Returns the number of transformations in a sentence.
 *
 *
 * @param {Object} sentence     A sentence object
 *
 * @return {number}             The number of transformations in the sentence
 */
this.getNumTransformations = function(sentence) {
    return sentence.transformations.length
}

/**
 * Returns the transformation at the specified index in the sentence.
 *
 *
 * @param {Object} sentence             A sentence object
 * @param {number} transformIndex       The transformation index
 *
 * @return {number}                     The number of transformations in the sentence
 */
this.getTransformationAtIndex = function(sentence, transformIndex) {
    return sentence.transformations[transformIndex]
}

/**
 * Gets the sentence at the specified index.
 *
 *
 * @param {Object} data     Result returned from submitJob
 *
 * @return {Object}         The sentence object at the specified index
 */
this.getSentence = function(data, sentenceIndex) {
    return data.rulesApplied[sentenceIndex]
}

/**
 * Get all transformations that overlap with the parameter transform.
 *
 * Ex: "He hzve be there before"
 * t1: "hzve" -> "have"
 * t2: "have be" -> "has been"
 *
 * getOverlappingGroup(sentence, t1) will return [t1, t2]
 *
 *
 * @param {Object} sentence     A sentence from the submitJob response (data.rulesApplied[index])
 * @param {Object} transform    A transformation inside that sentence (sentence.transformations[index])
 *
 * @return {Object}             An array of transformations that overlap with the parameter transformation
 */
this.getOverlappingGroup = function(sentence, transform) {
    return sentence.groups[transform.groupId]
}


/**
 * Get the text of the sentence in its current state, considering accepted/rejected corrections.
 *
 *
 * @param {Object} sentence    Sentence object
 *
 * @return {string}            The current text of the sentence
 */
this.getCurrentSentenceText = function(sentence) {
    return pt.tokensToString(sentence.activeTokens)
}

/**
 * Get the original text of a sentence, prior to any corrections.
 *
 *
 * @param {Object} sentence    Sentence object
 *
 * @return {string}            The original text of the sentence
 */
this.getOriginalSentenceText = function(sentence) {
    return pt.tokensToString(sentence.originalSentence)
}

/**
 * Get the current text of an entire document/job, considering accepted/rejected corrections.
 *
 *
 * @param {Object} data        Result returned from submitJob
 *
 * @return {string}            The current text of the job
 */
this.getCurrentText = function(data) {
    return data.rulesApplied.map(pt.getCurrentSentenceText).join("")
}


/**
 * Get the original text of an entire document/job, prior to any corrections.
 *
 *
 * @param {Object} data        Result returned from submitJob
 *
 * @return {string}            The original text of the job
 */
this.getOriginalText = function(data) {
    return data.rulesApplied.map(pt.getOriginalSentenceText).join("")
}

/**
 * Returns true if the parameter transformations affect the exact same tokens in the sentence.
 *
 *
 * @param {Object} transform1        The first transformation
 * @param {Object} transform2        The second transformation
 *
 * @return {boolean}                 True if the transformations effect the exact same tokens, else false
 */
this.affectsSameTokens = function(transform1, transform2) {
    return transform1.sentenceIndex == transform2.sentenceIndex &&
        transform1.tokensAffected.length == transform2.tokensAffected.length &&
        transform1.tokensAffected.every(function(token, index) {
            return token.id == transform2.tokensAffected[index].id
        })
}

/**
 * Get the sentence index of the parameter transformation.
 *
 *
 * @param {Object} transform       The transformation in question
 *
 * @return {number}                The index of the sentence in the job (0-based)
 */
this.getSentenceIndex = function(transform) {
    return transform.sentenceIndex
}

/**
 *  Get the index of the parameter transformation in the current sentence.
 *
 *
 * @param {Object} transform       The transformation in question
 *
 * @return {number}                The index of the transformation in the sentence (0-based)
 */
this.getTransformIndexInSentence = function(transform) {
    return transform.indexInSentence
}

/**
 * Get the index of the parameter transformation in the job.
 *
 * Note that this is a 0-based index relative to ALL transformations in the job,
 * not just those in the current sentence.
 *
 *
 * @param {Object} transform       The transformation in question
 *
 * @return {number}                The index of the transformation in the job (0-based)
 */
this.getTransformIndex = function(transform) {
    return transform.transformIndex
}

/**
 * Get the "tokens added" field as text (from an array of tokens).
 *
 *
 * @param {Object} transform       The transformation in question
 *
 * @return {string}                The tokens added as a string
 */
this.getAddedText = function(transform) {
    return pt.tokensToString(transform.tokensAdded)
}

/**
 * Get the "tokens affected" field as text (from an array of tokens).
 *
 *
 * @param {Object} transform       The transformation in question
 *
 * @return {string}                The tokens affected as a string
 */
this.getAffectedText = function(transform) {
    return pt.tokensToString(transform.tokensAffected)
}

/**
 * Returns true if the transformation is "clean", i.e. has not been accepted or rejected by the user.
 *
 *
 * @param {Object} transform        The transformation in question
 *
 * @return {boolean}                True if the transform is clean, else false
 */
this.isClean = function(transform) {
    return transform.status == pt.TRANSFORM_STATUS_CLEAN
}

/**
 * Returns true if the transformation has been accepted by the user
 *
 *
 * @param {Object} transform        The transformation in question
 *
 * @return {boolean}                True if the transform has been accepted, else false
 */
this.isAccepted = function(transform) {
    return transform.status == pt.TRANSFORM_STATUS_ACCEPTED
}

/**
 * Returns true if the transformation has been rejected by the user
 *
 *
 * @param {Object} transform        The transformation in question
 *
 * @return {boolean}                True if the transform has been rejected, else false
 */
this.isRejected = function(transform) {
    return transform.status == pt.TRANSFORM_STATUS_REJECTED
}

/**
 * Returns true if the transformation can be made, given the current state of the sentence.
 *
 * This is checked by verifying that all of the "tokensAffected" in the transformation are present
 * in the active working set of tokens in the sentence.
 *
 * @param {Object} transform        The transformation in question
 *
 * @return {boolean}                True if the transform can be made, else false
 */
this.canMakeTransform = function(sentence, transform) {
    return tokensArePresent(transform.tokensAffected, sentence.activeTokens)
}

/**
 * Returns true if the transformation can be undone, given the current state of the sentence.
 *
 * This is checked by verifying that all of the "tokensAdded" in the transformation are present
 * in the active working set of tokens in the sentence (if there are any).
 *
 * @param {Object} transform        The transformation in question
 *
 * @return {boolean}                True if the transform can be undone, else false
 */
this.canUndoTransform = function(sentence, transform) {
    return !transform.hasReplacement ||
        (pt.isAccepted(transform) && tokensArePresent(transform.tokensAdded, sentence.activeTokens)) ||
        (pt.isRejected(transform) && tokensArePresent(transform.tokensAffected, sentence.activeTokens))
}


/**
 * Get the character offset of the sentence, given the current state of the job.
 *
 * @param {Object} data        Result returned from submitJob
 * @param {Object} sentence    The sentence in question
 *
 * @return {number}            The character offset of the sentence
 */
this.getSentenceOffset = function(data, sentence) {

    var fullText = ""
    var offset = -1

    return data.rulesApplied.find(function(s, sentIndex) {
        if (sentIndex == sentence.sentenceIndex) {
            offset = fullText.length
            return true
        } else {
            fullText += pt.getCurrentSentenceText(s)
            return false
        }
    })

    return offset
}

/**
 * Get the character offset of the transformation relative to the sentence start
 * given the current state of the job.
 *
 * @param {Object} data        Result returned from submitJob
 * @param {Object} sentence    The transformation in question
 *
 * @return {number}            The character offset of the transformation (relative to sentence start), or -1 if it is not present
 */
this.getTransformOffset = function(data, transform) {

    const sentence = data.rulesApplied[transform.sentenceIndex]

    if (pt.canMakeTransform(sentence, transform)) {
        const activeTokens = sentence.activeTokens
        return getTransformOffsetHelper(transform, activeTokens)
    }

    return -1
}

/**
 * Join tokens into a single string.
 *
 * This will map each token to [token.value] + [token.after] and join together.
 *
 * @param {Object} tokens      The tokens to turn into a string
 *
 * @return {string}            The tokens joined as a single string
 */
this.tokensToString = function(tokens) {
    return tokens.map(function(token) {
        return token.value + token.after
    }).join("")
}

/**
 * Set job metadata in-place for easier interaction/manipulation.
 *
 * Main steps:
 *
 * 1. 
 *     Some transformations overlap/are derived from the result of others. 
 *     Iterate through all transformations and mark transformations that are 
 *     dependent on others as being members of the same group.
 *
 *         ex: "He hzve be there befor"
 *
 *         Transformations:
 *             hzve -> have
 *             have be -> has been
 *             befor -> before
 *         Groups:
 *             0:
 *                 hzve -> have
 *                 have be -> has been
 *             1:
 *                 befor -> before
 * 2.
 *     Set transform -> sentence/transform index and sentence -> sentenceIndex for quicker referencing
 * 3.
 *     Update the "active tokens" in the sentence based on the current status of the transformations
 *     (useful if recovering a previous job that already has transformations set to accept/reject)
 *
 *     If not recovering a previous job, set the active tokens to the initial set.
 *
 *
 * @param {Object} data        Result returned from submitJob
 */
this.setMetaData = function(data) {

    if (!data.rulesApplied) return

    // Count all transforms seen (accross all sentences) and assign index (used as unique id)
    var transformCounter = 0

    data.rulesApplied.forEach(function(sentence, sentenceIndex) {

        // current working set of tokens in the sentence
        sentence.activeTokens = sentence.originalSentence

        // hold reference to index
        sentence.sentenceIndex = sentenceIndex

        // track overlapping transform groups
        sentence.groups = {}

        // Group id for overlapping transformations in the current sentence
        var groupIdCounter = 0

        const numTransformsInSent = sentence.transformations.length

        // Assign group id to each transform
        sentence.transformations.forEach(function(transform, transformIndex) {

            // Set indices for future reference
            transform.transformIndex = transformCounter++ // index relative to flattened list of all transforms
                transform.indexInSentence = transformIndex // index in current sentence
            transform.sentenceIndex = sentenceIndex // sentence index

            if (!transform.status) {
                transform.status = pt.TRANSFORM_STATUS_CLEAN
            }

            /*
                Since the transformations are topologically sorted (they are in the order that they were made by Perfect Tense),
                we can just iterate through in-order and make replacements if the state is set to accepted
            */
            updateActiveTokens(sentence, transform)

            // Set group id (if not previously marked by upstream transform)
            if (transform.groupId == undefined) {
                const groupQueue = [transform]
                const groupId = groupIdCounter++
                    sentence.groups[groupId] = []

                /*
                    Find all transformations that overlap with this transform, then all that overlap with those, etc. (breadth first search)
                */
                while (groupQueue.length > 0) {
                    const nextInGroup = groupQueue.shift()

                    if (nextInGroup.groupId == undefined) {
                        nextInGroup.groupId = groupId
                        sentence.groups[groupId].push(nextInGroup)

                        /*
                             Since the transforms are already sorted based on the order they were created,
                             we just need to check the rest of the queue for unassigned/overlapping transforms
                        */
                        for (var i = nextInGroup.indexInSentence + 1; i < numTransformsInSent; i++) {
                            const nextTrans = sentence.transformations[i]

                            // won't be set yet...
                            nextTrans.indexInSentence = i;

                            if (nextTrans.groupId == undefined && transformsOverlap(nextInGroup, nextTrans, true)) {
                                groupQueue.push(nextTrans)
                            }
                        }
                    }
                }
            }
        })

        setIsAvailable(sentence.transformations, sentence)
    })

    data.hasMeta = true
}

/**
 * Get all available transformations in the sentence.
 *
 * It is assumed that the "isAvailable" field in each transformation is kept up-to-date
 * (generally handled for you when using this API).
 *
 * @param {Object} sentence        The sentence in question
 */
this.getAvailableTransforms = function(sentence) {
    return sentence.transformations.filter(transform => transform.isAvailable)
}


/*********************************************************************
                Private Helper Functions/Utilities
**********************************************************************/

/**
 * Returns true if the tokens are a valid subsequence of the active tokens in the sentence.
 *
 *
 * @param {Object} tokens       An array of token objects
 * @param {Object} allTokens    An array of tokens to look for "tokens" in
 *
 * @return {boolean}            True if the tokens are a valid subsequence, else false
 */
function tokensArePresent(tokens, allTokens) {
    var lastIndex = -1

    const isAvailable = tokens.every(function(token) {

        const indexOfId = allTokens.findIndex(function(activeToken) {
            return token.id == activeToken.id
        })

        if (indexOfId != -1 && (lastIndex == -1 || indexOfId == lastIndex + 1)) {
            lastIndex = indexOfId
            return true
        }

        return false
    })

    return isAvailable
}

/**
 * Returns true if the elements of the parameter arrays overlap, optionally using the passed comparator.
 *
 *
 * @param {Object} a1                   The first array
 * @param {Object} a2                   The second array
 * @param {function} comparator=null    Optional comparator function
 *
 * @return {boolean}                    True if the array elements overlap, else false
 */
function arraysOverlap(a1, a2, comparator) {

    comparator = comparator || function(x, y) {
        return x == y
    }

    return a1.some(function(e1) {
        return a2.some(function(e2) {
            return comparator(e1, e2)
        })
    })
}

/**
 * Returns true if the ids of the parameter tokens match.
 *
 *
 * @param {Object} t1                   The first token
 * @param {Object} t2                   The second token
 *
 * @return {boolean}                    True if the token ids are the same, else false
 */
function compareTokens(t1, t2) {
    return t1.id == t2.id
}

/**
 * Returns true if the parameter transformations overlap in any way, considering both tokensAffected and tokensAdded.
 *
 * If inOrder is true, it is assumed that t1 came prior to t2 in the correction pipeline, and we are guaranteed
 * that the tokensAffected of t1 do not overlap with the tokensAdded of t2 (t1 is not dependent on t2)
 *
 *
 * @param {Object} t1                   The first transformation
 * @param {Object} t2                   The second transformation
 * @param {boolean} inOrder=false       True if the transformations are in the order they were created, else false
 *
 * @return {boolean}                    True if the transformations overlap, else false
 */
function transformsOverlap(t1, t2, inOrder) {

    return arraysOverlap(t1.tokensAffected, t2.tokensAffected, compareTokens) || // directly affect same tokens
        arraysOverlap(t1.tokensAdded, t2.tokensAffected, compareTokens) || // t2 dependent on t1
        (!inOrder && arraysOverlap(t2.tokensAdded, t1.tokensAffected, compareTokens)) // t1 dependent on t2 (don't check if transforms are in order)
}

/**
 * Helper function to get the character offset of a transformations.
 *
 *
 * @param {Object} transform           The transformation in question
 * @param {Object} activeTokens        The array of active tokens in the sentence
 *
 * @return {number}                    True  character offset of the transformation, or -1 if it is not present
 */
function getTransformOffsetHelper(transform, activeTokens) {

    const firstAffected = transform.tokensAffected[0]

    var offset = -1
    var sentString = ""

    activeTokens.find(function(token, index) {
        if (token.id == firstAffected.id) {
            offset = sentString.length
            return true
        } else {
            sentString += token.value + token.after
        }
    })

    return offset
}

/**
 * Helper to clone a hash object.
 *
 * @param {Object} hash        The hash to be cloned
 *
 * @return {Object}            A shallow copy of the hash
 */
function cloneHash(hash) {
    return Object.assign({}, hash)
}

/**
 * Check if the client has been configured to persist transformation status updates.
 *
 *
 * @return {boolean}        True if can persist, else false
 */
function canPersist() {
    return pt.persist
}

/**
 * Save the transformation's status (clean, accepted, rejected).
 *
 * This is optional and can be turned off when calling "initialize".
 *
 * Please consider leaving this enabled, as it helps Perfect Tense learn!
 *
 *
 * @param {Object} ptData            Result returned from submitJob
 * @param {Object} transform         The transformation to save
 * @param {string} apiKey            The apiKey associated with this job
 * @param {string} sentenceText      The sentence's current text (just prior to making transformation)
 * @param {number} offset            Offset of the transform's tokensAffected in the sentenceText
 */
function saveTransformStatus(ptData, transform, apiKey, sentenceText, offset) {

    const data = {
        jobId: ptData.id,
        responseType: "rulesApplied",
        sentenceIndex: transform.sentenceIndex,
        transformIndex: transform.indexInSentence,
        sentence: sentenceText,
        offset: offset,
        status: transform.status
    }

    submitToPT(data, apiKey, "/updateStatus")
}

/**
 * Utility to submit a payload to the Perfect Tense API
 *
 * Once configured, this integration's "App Key" will be inserted into all API requests.
 *
 * See our API documentation for more information: https://www.perfecttense.com/docs/#introduction
 *
 * @param {Object} data            Payload to be submitted (see api docs: )
 * @param {Object} apiKey           The user's apiKey to validate this request
 * @param {string} endPoint        The API endpoint (see docs)
 */
function submitToPT(data, apiKey, endPoint) {

    const payload = {
        method: 'POST',
        url: PT_BASE_URL + endPoint,
        data: data,
        headers: {
            'Authorization': apiKey,
            'AppAuthorization': pt.appKey,
            'Content-Type': 'application/json'
        }
    }

    return axios(payload)
}

/**
 * The the "isAvailable" status of the parameter transformations.
 *
 * A transformation is defined as "available" if its tokensAffected field is a valid 
 * subsequence of the active tokens in the sentence (after any accept/reject actions).
 *
 * @param {Object} transforms      The transformation to be updated
 * @param {Object} sentence        The sentence that the transformations belong to
 */
function setIsAvailable(transforms, sentence) {

    function setAvailable(transform) {
        if (pt.canMakeTransform(sentence, transform)) {
            transform.isAvailable = true
        } else {
            transform.isAvailable = false
        }
    }

    transforms.forEach(setAvailable)
}


/**
 * Utility to replace the "affected" tokens with the "added" tokens in the parameter "tokens" array.
 *
 * When a transformation is "accepted", we replace the "tokensAffected" with the "tokensAdded".
 *
 * When a transformation is "undone", we do the opposite.
 *
 * If "affected" is not a valid subsequence of the parameter "tokens", then no replacement can be made
 * and the original tokens are returned.
 *
 *
 * @param {Object} tokens      An array of tokens to make the replacement in
 * @param {Object} affected    A subsequence of "tokens" to be replaced
 * @param {Object} added       An array of tokens that will replace "affected"
 */
function replaceTokens(tokens, affected, added) {

    // Can't replace if they're not there!
    if (!tokensArePresent(affected, tokens)) {
        return tokens
    }

    const firstTokenId = affected[0].id
    const lastTokenId = affected[affected.length - 1].id

    const startInd = tokens.findIndex(function(token) {
        return token.id == firstTokenId
    })

    const endInd = tokens.findIndex(function(token) {
        return token.id == lastTokenId
    })

    // Sanity check. They should be there if tokensArePresent passed
    if (startInd != -1 && endInd != -1 && endInd >= startInd) {
        const before = tokens.slice(0, startInd)
        const after = tokens.slice(endInd + 1)
        return before.concat(added).concat(after)
    }

    // Failed to replace for unknown reason
    return tokens
}

/**
 * Update the "isAvailable" status of every transformation in the same "group"
 * as the parameter transform in the sentence.
 *
 * When a transformation is accepted, rejected, or undone, we only want to refresh
 * the status of transformations that potentially overlap/are affected. In "setMetaData",
 * we grouped all transformations that overlapped together, so we can just use that cache here.
 *
 *
 * @param {Object} sentence        The sentence that the transformation is in
 * @param {Object} transform       The transformation whose overlapping group will be refreshed
 */
function updateTokenGroup(sentence, transform) {
    // Cached list of all transformations that overlap
    const tokenGroup = sentence.groups[transform.groupId]

    // Set isAvailable status of all overlapping transformations
    setIsAvailable(tokenGroup, sentence)
}


/**
 * Utility to "make" a transformation (accept it).
 *
 * This involves swapping the tokensAdded in for the tokensAffected (if the transform has a replacement),
 * and refreshing the "isAvailable" status of all tokens in the same overlapping group.
 *
 * Note that "canMakeTransform" should generally be called before this.
 *
 *
 * @param {Object} sentence        The sentence that the transformation is in
 * @param {Object} transform       The transformation to accept
 */
function makeTransform(sentence, transform) {
    if (transform.hasReplacement) {
        sentence.activeTokens = replaceTokens(sentence.activeTokens, transform.tokensAffected, transform.tokensAdded)

        // update isAvailable status of all overlapping transformations
        updateTokenGroup(sentence, transform)
    }

    // Explicity set, since transformations with hasReplacement = false will technically still be executable
    transform.isAvailable = false
}

/**
 * Utility to "undo" a transformation.
 *
 * This involves swapping the tokensAffected in for the tokensAdded (if the transform has a replacement),
 * and refreshing the "isAvailable" status of all tokens in the same overlapping group.
 *
 * Note that "canUndoTransform" should generally be called before this.
 *
 *
 * @param {Object} sentence        The sentence that the transformation is in
 * @param {Object} transform       The transformation to undo
 */
function undoTransform(sentence, transform) {

    if (transform.hasReplacement) {
        sentence.activeTokens = replaceTokens(sentence.activeTokens, transform.tokensAdded, transform.tokensAffected)

        // update isAvailable status of all overlapping transformations
        updateTokenGroup(sentence, transform)
    }

    transform.isAvailable = true
}

/**
 * Utility used during setMetaData to update the active tokens if the recovered transformation was accepted.
 *
 * Updates the active working set of tokens for the sentence.
 *
 * @param {Object} sentence        The sentence that the transformation is in
 * @param {Object} transform       The transformation to accept
 */
function updateActiveTokens(sentence, transform) {
    if (transform.hasReplacement && pt.isAccepted(transform)) {
        sentence.activeTokens = replaceTokens(sentence.activeTokens, transform.tokensAffected, transform.tokensAdded)
    }
}