import type { ModuleOptions } from "../module-base";

export const textOptions: ModuleOptions = {
  id: "Text",
  name: "Text",
  description: "Text manipulation utilities.",
  examplePlaceholders: {
    "Upper": {
      value: "HELLO WORLD",
      description: "Converts the input text to uppercase.",
      fillText: "Text;Upper;${1:inputText}"
    },
    "Lower": {
      value: "hello world",
      description: "Converts the input text to lowercase.",
      fillText: "Text;Lower;${1:inputText}"
    },
    "Title": {
      value: "Hello World",
      description: "Converts the input text to title case.",
      fillText: "Text;Title;${1:inputText}"
    },
    "Length": {
      value: "11",
      description: "Returns the length of the input text.",
      fillText: "Text;Length;${1:inputText}"
    },
    "Reverse": {
      value: "dlroW olleH",
      description: "Reverses the input text.",
      fillText: "Text;Reverse;${1:inputText}"
    },
    "Repeat": {
      value: "Hello Hello Hello ",
      description: "Repeats the input text a specified number of times.",
      fillText: "Text;Repeat;${1:3};${2:inputText}"
    },
    "Slice": {
      value: "lo Wo",
      description: "Extracts a section of the input text.",
      fillText: "Text;Slice;${1:startIndex};${2:endIndex};${3:inputText}"
    },
    "Format": {
      value: "ⓡⓞⓤⓝⓓⓔⓓ ⓣⓔⓧⓣ",
      description: "Formats the input text based on predefined formats (SuperScript, SmallCaps, Rounded, Bold, Italic, BoldItalic, Fullwidth, Fraktur, DoubleStruck, Strikethrough).",
      fillText: "Text;Format;${1:SuperScript|SmallCaps|Rounded|Bold|Italic|BoldItalic|Fullwidth|Fraktur|DoubleStruck|Strikethrough};${2:inputText}"
    },
    "Truncate": {
      value: "This is a ve...",
      description: "Truncates the input text to a specified length and appends ellipsis if necessary.",
      fillText: "Text;Truncate;${1:length};${2:inputText}"
    },
    "Build;ProgressBar": {
      value: "█████░░░░░",
      description: "Builds a progress bar based on current and total values. Optional 6th param is a head character shown at the fill boundary.",
      fillText: "Text;Build;ProgressBar;${1:currentValue};${2:totalValue};${3:length};${4:fillChar};${5:emptyChar};${6:headChar}"
    },
    "Build;StarRating": {
      value: "★★★☆☆",
      description: "Builds a star rating based on rating and maximum rating values.",
      fillText: "Text;Build;StarRating;${1:ratingValue};${2:maxRatingValue};${3:filledChar};${4:emptyChar}"
    },
    "Animate;Marquee": {
      value: "Hello World Hello World ",
      description: "Creates a marquee animation effect for the input text. Specify direction (Left or Right), and maximum visible length. Default is NoPadding mode.",
      fillText: "Text;Animate;Marquee;${1:inputText};${2:Left|Right};${3:maxLength}"
    },
    "Animate;EachOne": {
      value: "Hello",
      description: "Animates list of texts by displaying each one sequentially.",
      fillText: "Text;Animate;EachOne;${3:inputText};${4:inputText...}"
    },
    "Animate;EachOneCustom": {
      value: "Hello",
      description: "Animates list of texts by displaying each one sequentially with custom intervals. (interval in int * 2200ms)",
      fillText: "Text;Animate;EachOneCustom;${3:intervalInt:item1};${4:intervalInt:item2};${5:...}"
    },
    "Trim": {
      value: "hello world",
      description: "Removes leading and trailing whitespace from the text.",
      fillText: "Text;Trim;${1:inputText}"
    },
    "Replace": {
      value: "Hi World",
      description: "Replaces all occurrences of a substring with another in the text.",
      fillText: "Text;Replace;${1:searchText};${2:replaceText};${3:inputText}"
    },
    "Pad": {
      value: "   Hello",
      description: "Pads the text to a specified length on Left, Right, or Center.",
      fillText: "Text;Pad;${1:Left|Right|Center};${2:length};${3:padChar};${4:inputText}"
    },
    "WordCount": {
      value: "2",
      description: "Returns the number of words in the text.",
      fillText: "Text;WordCount;${1:inputText}"
    },
    "Capitalize": {
      value: "Hello world",
      description: "Capitalizes the first character of the text.",
      fillText: "Text;Capitalize;${1:inputText}"
    },
    "Build;HealthBar": {
      value: "♥♥♥♡♡",
      description: "Builds a health bar based on current and max values.",
      fillText: "Text;Build;HealthBar;${1:currentHP};${2:maxHP};${3:filledChar};${4:emptyChar}"
    },
    "Build;Toggle": {
      value: "ON",
      description: "Returns one of two texts based on a truthy/falsy value.",
      fillText: "Text;Build;Toggle;${1:value};${2:trueText};${3:falseText}"
    },
    "Animate;Typewriter": {
      value: "Hell",
      description: "Reveals the text character by character over time.",
      fillText: "Text;Animate;Typewriter;${1:inputText}"
    },
    "Animate;Blink": {
      value: "Hello",
      description: "Alternates between two texts at a set interval.",
      fillText: "Text;Animate;Blink;${1:text1};${2:text2}"
    },
    "Animate;Bounce": {
      value: " Hello",
      description: "Creates a left-right bouncing marquee effect.",
      fillText: "Text;Animate;Bounce;${1:inputText};${2:maxLength}"
    },
    "If": {
      value: "Text is not empty",
      description: "Returns trueText or falseText based on a condition (Empty, NotEmpty, Equals).",
      fillText: "Text;If;${1:Empty|NotEmpty|Equals};${2:inputText};${3:trueText};${4:falseText}"
    },
    "Default": {
      value: "fallback",
      description: "Returns the text if non-empty, otherwise the fallback value.",
      fillText: "Text;Default;${1:fallbackText};${2:inputText}"
    },
    "NumberFormat": {
      value: "1,234.56",
      description: "Formats a number with decimal places, decimal separator and thousands separator.",
      fillText: "Text;NumberFormat;${1:decimals};${2:decimalSeparator};${3:thousandsSeparator};${4:number}"
    }
  }
};
