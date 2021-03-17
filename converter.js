// This script converts the Gregory Crane XML of Cunliffe's Homeric lexicon to a JSON of my own specification
// There are three main steps to the conversion
// 1) pre-processing: remove extraneous tags and convert numbers to superscripts
// 2) XML -> JSON with xml2js, using the settings below to preserve text order in <p>
// 3) Creating a new JSON with a custom data structure

// dependencies

var fs = require('fs');
    xml2js = require('xml2js');
    strip_tags = require('locutus/php/strings/strip_tags');

/* one problem is dealing with html-like use of tags like <gloss>
see discussion at https://github.com/Leonidas-from-XIV/node-xml2js/issues/283 */
var parser = new xml2js.Parser({includeWhiteChars: 'true',charsAsChildren: 'true',explicitChildren: 'true',preserveChildrenOrder: 'true'});
const allowed_tags = '<TEI><text><body><head><div><p><gloss><quote><bibl><term>'

// main script; xml2js used here.

function convertFile(file) {
  fs.readFile('./input/' + file, 'utf8', function(err, data) {
    // remove extraneous tags like <foreign>, & superscript numbers at ends of Greek words
    data = strip_tags(data, allowed_tags);
    data = toSuperscript(data);

    parser.parseStringPromise(data).then(function (result) {

      // Execute conversion
      var oldWords = result.TEI.text[0].body[0].div;
      let words = [];
      for(let oldWord of oldWords) {
        words.push(parseWord(oldWord));
      }

      // Write to JSON file
      console.log("Done, now writing to file");
      var jsonString = JSON.stringify(words);
      var fileName = file.replace('.xml', '.json');
      fs.writeFile('./output/' + fileName, jsonString, function(err) {
        if (err) { throw err }
      });
    })
    .catch(function (err) {
      // Failed
      console.log("error!");
      console.log(err);
    });
 });
}

fs.readdir('./input', {encoding: 'utf8', withFileTypes: true}, function(err, files) {
  if (err) { throw err }
  files.map(function(file) {
    console.log(file.name);
    if(file.name !== '.DS_Store') convertFile(file.name);
  })
})

// Preprocessing

function toSuperscript(text) {
    // looks for Greek character, non white space, then number
    // misses things like μετα- 6, so could be improved
    const superscriptTest = /[\u0370-\u03ff\u1f00-\u1fff]\S+([0-9])/g;
    const superscriptDict = new Map([
      ['0', '⁰'],
      ['1', '¹'],
      ['2', '²'],
      ['3', '³'],
      ['4', '⁴'],
      ['5', '⁵'],
      ['6', '⁶'],
      ['7', '⁷'],
      ['8', '⁸'],
      ['9', '⁹']
    ]);
    function wordToSuperscript(str, p1, offset) {
      return(str.substring(0, str.length - 1) + superscriptDict.get(p1));
    }
    return text.replace(superscriptTest, wordToSuperscript);
}

// Main work of script: conversion of t

function parseWord(oldWord) {
  //This function parses a specific word from the JSON, returning a replacement new word.
  let newWord = {}
  newWord.headword = oldWord.head[0]['_'];
  newWord.etym = [];
  newWord.forms = [];
  newWord.defs = {type: 'definition', data: []};

  // This loop goes over the p's that exist before the definition divs
  if(Array.isArray(oldWord.p) && oldWord.p.length > 0) {
    parseFirstP(newWord, oldWord); 
  }

  // This loop goes over the divs that contain definition information.  
  if(Array.isArray(oldWord.div) && oldWord.div.length > 0) {
    oldWord.div.forEach(divItem => parseDefDiv(newWord, divItem)); 
  }

  return newWord;
}

function parseFirstP(newWord, oldWord) {
  // This evaluates the p's that exist before the definition divs; it is possible for 
  // them to include information on etymology, forms, and definitions, and this loop
  // makes a half-hearted effort to sort the p's accordingly. 
  // the variable currentPartOfEntry is used to preserve order.
  let currentPartOfEntry = 0;
  
  oldWord.p.forEach(function(pItem, index) {
    if(Array.isArray(pItem['$$']) && pItem['$$'].length > 0) {
      let newTextArray = pToTextArray(pItem);
      let nextPBeginningCharacter;

      // rather ugly effort to extract beginning character of the *next* p
      if(oldWord.p[index+1] && oldWord.p[index+1]['_']) {
        nextPBeginningCharacter = oldWord.p[index+1]['_'][0];
      }

      function isFormPunctuation(char) {
        return(char === '[' || char === '-' || char === '(');
      }

      //if the p or the next p is a etymology beginning with [, -, or (
      if (currentPartOfEntry < 1 && 
        (isFormPunctuation(newTextArray.data[0].text[0]) || 
        isFormPunctuation(nextPBeginningCharacter))
      ) {
        newWord.etym.push(newTextArray);   
      }
      //if the p includes a term or begins with [-( but comes after an item with a term
      else if (currentPartOfEntry < 2 && 
        //searches array data for a textType of term, suggesting a form
        (newTextArray.data.find(({textType}) => textType === 'term') ||
        isFormPunctuation(newTextArray.data[0].text[0]))
      ) {
        newWord.forms.push(newTextArray);  
        currentPartOfEntry = 1;
      }
      // otherwise is a meaning.
      else {
        newWord.defs.data.push({type: 'meaning', data:[newTextArray]});
        currentPartOfEntry = 2;
      }
    }
  });
}

https://stackoverflow.com/questions/175739/built-in-way-in-javascript-to-check-if-a-string-is-a-valid-number
function isNumeric(value) {
  return /^-?\d+$/.test(value);
}

// returns true for Roman numerals I-VII (testing for branches, which have max VI)
function isRomanNumeral(value) {
  return /[VI]+/.test(value);
}

function isStraySubmeaning(value) {
  return/[abcdefghijkl]+/.test(value);
}

function parseDefDiv(newWord, divItem) {
  //This function parses a div from the definition section of the JSON

  // If there is no head, this is a small entry without structure to its definition.
  // Create a meaningObj
  if(!divItem.head) {
    newWord.defs.data.push(createMeaning(divItem)); 
  }

  // If the head is ABC, then this is a div containing forms, not a defdiv.
  else if (/[ABC]+/.test(divItem.head[0]['_'])) {
    newWord.forms.push({
      'type': 'textArray',
      'data': [{'text': divItem.head[0]['_'], 'textType': 'formHead'}]
    });
    if(!divItem.p) {
      console.log("what happened!");
    }
    divItem.p.forEach(pItem => {
      newWord.forms.push(pToTextArray(pItem));
    });
  }

  // If the head is an arabic numeral, this is a standard entry with only meanings and below to its definition
  // Create a meaningObj
  else if(isNumeric(divItem.head[0]['_'])) {
    newWord.defs.data.push(createMeaning(divItem)); 
  }

  // if the head is a lower-case a-l, then the XML has incorrectly separated a submeaning from its parent meaning
  // Integrate with that meaning.
  else if(isStraySubmeaning(divItem.head[0]['_'])) {
    newWord.defs.data[newWord.defs.data.length-1].data.push(createSubmeaning(divItem)); 
  }

  // if the head is a Roman numeral I - VI, then we have a branch.
  else if(isRomanNumeral(divItem.head[0]['_'])) {
    newWord.defs.data.push(createBranch(divItem)); 
  }

  // if head begins with a Greek letter, it's a prefix or suffix entry. Treat as branch
  else if(/[\u0370-\u03ff\u1f00-\u1fff].*/.test(divItem.head[0]['_'])) {
    newWord.defs.data.push(createBranch(divItem)); 
  }

  // Should be nothing left
  else {
    console.log(newWord.headword + ' ' + divItem.head[0]['_']);
  }
}

//These next four functions are quite similar and could probably be profitably combined.
function createBranch(divItem) {
  let newBranch = {type: 'branch', data: []};
  if(divItem.head) {
    newBranch['head'] = divItem.head[0]['_'];
  } 
  // I assume here (maybe incorrectly) that all p's are before div's in a branch div.
  if(Array.isArray(divItem.p) && divItem.p.length > 0) {
    divItem.p.forEach(pItem => {
      // if pItem has a term but no bibl, likely a short explanation of the branch
      if(pItem.term && !pItem.bibl) {
        newBranch.data.push(pToTextArray(pItem));
      }
      // otherwise likely a meaning directly put on branch
      else {
        newBranch.data.push({
          'type': 'meaning',
          'data': [pToTextArray(pItem)]
        });
      }
    });
  }
  // Then evaluate divs.
  if(Array.isArray(divItem.div) && divItem.div.length > 0) {
    divItem.div.forEach(divItem => {
      newBranch.data.push(createMeaning(divItem));
    });
  }
  return newBranch;
}

function createMeaning(divItem) {
let newMeaning = {type: 'meaning', data: []};
  if(divItem.head) {
    newMeaning['head'] = divItem.head[0]['_'];
  } 
  // I assume here (maybe incorrectly) that all p's are before div's in a meaning div.
  if(Array.isArray(divItem.p) && divItem.p.length > 0) {
    divItem.p.forEach(pItem => {
      newMeaning.data.push(pToTextArray(pItem));
    });
  }
  // Then evaluate divs.
  if(Array.isArray(divItem.div) && divItem.div.length > 0) {
    divItem.div.forEach(divItem => {
      newMeaning.data.push(createSubmeaning(divItem));
    });
  }
  return newMeaning;
}

function createSubmeaning(divItem) {
  let newSubmeaning = {type: 'submeaning', data: []};
  if(divItem.head) {
    newSubmeaning['head'] = divItem.head[0]['_'];
  } 

  // I assume here (maybe incorrectly) that all p's are before div's in a submeaning div.
  if(Array.isArray(divItem.p) && divItem.p.length > 0) {
    divItem.p.forEach(pItem => {
      newSubmeaning.data.push(pToTextArray(pItem));
    });
  }
  // Then evaluate divs.
  if(Array.isArray(divItem.div) && divItem.div.length > 0) {
    divItem.div.forEach(divItem => {
      newSubmeaning.data.push(createSubSubmeaning(divItem));
    });
  }
  return newSubmeaning;
}

function createSubSubmeaning(divItem) {
  let newSubSubmeaning = {type: 'subsubmeaning', data: []};
  if(divItem.head) {
    newSubSubmeaning['head'] = divItem.head[0]['_'];
  } 

  // I assume here (maybe incorrectly) that all p's are before div's in a subsubmeaning div.
  if(Array.isArray(divItem.p) && divItem.p.length > 0) {
    divItem.p.forEach(pItem => {
      newSubSubmeaning.data.push(pToTextArray(pItem));
    });
  }
  // If in fact there are subdivision inside of subsubmeaning -- which only occurs at
  // ἧος 4cβ -- push those as additional subsubmeanings.
  if(Array.isArray(divItem.div) && divItem.div.length > 0) {
    divItem.div.forEach(divItem => {
      divItem.p.forEach(pItem => {
        newSubSubmeaning.data.push(pToTextArray(pItem));
      });
    });
  }
  return newSubSubmeaning;
}

function pToTextArray(para) {
  // takes a p obj from the JSON and iterates over it, evaluating each of its children.
  // This is the workhorse of the script, creating arrays of formatted text.
  // It creates an object consisting of a textType and text
  // to the array of a TextArray object with a tag
  // Output: {type: textArray, data: [{textType: 'text', text: 'Lorem ipsum'}]}

  let newPara = [];
  for(let i = 0; i<para['$$'].length; i++) {
    const textObj = para['$$'][i];
    let newTextObj = {};
    newTextObj.text = textObj['_'];
    if(textObj['#name'].includes('text')) {
      const prevObj = para['$$'][i-1];
      if(prevObj && prevObj['#name'].includes('bibl')) newTextObj.textType = 'small_text';
      else if (prevObj && prevObj['#name'].includes('quote')) newTextObj.textType = 'small_text';
      else newTextObj.textType = 'text';
    }
    else if (textObj['#name'].includes('gloss')) {
      newTextObj.textType = 'gloss';
    }
    else if (textObj['#name'].includes('quote')) {
      newTextObj.textType = 'quote';
    }
    else if (textObj['#name'].includes('bibl')) {
      newTextObj.textType = 'bibl';
    }
    else if (textObj['#name'].includes('term')) {
      newTextObj.textType = 'term';
    }
    newPara.push(newTextObj);
  }
  return {type: 'textArray', data: newPara};
}