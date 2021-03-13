// This script converts the Gregory Crane XML of Cunliffe's Homeric lexicon to a JSON of my own specification
// There are three main steps to the conversion
// 1) pre-processing: remove extraneous tags and convert numbers to superscripts
// 2) XML -> JSON with xml2js, using the settings below to preserve text order in <p>
// 3) Creating a new JSON with a custom data structure

var fs = require('fs');
    xml2js = require('xml2js');
    strip_tags = require('locutus/php/strings/strip_tags');

/* one problem is dealing with html-like use of tags like <gloss>
see discussion at https://github.com/Leonidas-from-XIV/node-xml2js/issues/283 */
var parser = new xml2js.Parser({includeWhiteChars: 'true',charsAsChildren: 'true',explicitChildren: 'true',preserveChildrenOrder: 'true'});
const allowed_tags = '<TEI><text><body><head><div><p><gloss><quote><bibl><term>'

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

function pToTextArray(para) {
  // takes a p obj from the JSON and iterates over it, evaluating each of its children.
  // It creats an object consisting of a textType and text
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

function parseFirstP(newWord, pItem) {
  // This evaluates a p that exists before the definition divs; it is possible for 
  // them to include information on etymology, forms, and definitions, and this loop
  // makes a half-hearted effort to sort the p's accordingly. It should be revised to preserve order.
  if(Array.isArray(pItem['$$']) && pItem['$$'].length > 0) {
    let newTextArray = pToTextArray(pItem);
    if (newTextArray.data[0].textType === 'term') {
      newWord.forms.push(newTextArray);  
    }
    else if (newTextArray.data[0].text[0] === '[' || newTextArray.data[0].text[0] === '-' || newTextArray.data[0].text[0] === '(') {
      newWord.etym.push(newTextArray);   
    }
    else {
      newWord.defs.data.push({type: 'meaning', data:[newTextArray]});
    }
  }      
}
//These next three functions are quite similar and could probably be profitably combined.
function createMeaning(newWord, divItem) {
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
  if(newMeaning.head || newMeaning.data.length > 0) {
    newWord.defs.data.push(newMeaning);
  }
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

https://stackoverflow.com/questions/175739/built-in-way-in-javascript-to-check-if-a-string-is-a-valid-number
function isNumeric(value) {
  return /^-?\d+$/.test(value);
}

function parseDefDiv(newWord, divItem) {
  //This function parses a div from the definition section of the JSON

  // If there is no head, this is a small entry without structure to its definition.
  // Create a meaningObj
  if(!divItem.head) {
    createMeaning(newWord, divItem);
  }

  // If the head is an arabic numeral, this is a standard entry with only meanings and below to its definition
  // Create a meaningObj
  else if(isNumeric(divItem.head[0]['_'])) {
    createMeaning(newWord, divItem); 
  }
}

function parseWord(oldWord) {
  //This function parses a specific word from the JSON, returning a replacement new word.
  let newWord = {}
  newWord.headword = oldWord.head[0]['_'];
  newWord.etym = [];
  newWord.forms = [];
  newWord.defs = {type: 'definition', data: []};

  // This loop goes over the p's that exist before the definition divs
  if(Array.isArray(oldWord.p) && oldWord.p.length > 0) {
    oldWord.p.forEach(pItem => parseFirstP(newWord, pItem)); 
  }

  // This loop goes over the divs that contain definition information.  
  if(Array.isArray(oldWord.div) && oldWord.div.length > 0) {
    oldWord.div.forEach(divItem => parseDefDiv(newWord, divItem)); 
  }

  if (newWord.defs.data.length === 0) delete newWord.defs;
  return newWord;
}

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