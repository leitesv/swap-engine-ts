/*
    Simple Logger made for Swap Engine.

    Contributors: leitesv <leitesv@tuta.io>

*/

import colors from "colors";
import fs from 'fs';
type ILoggerOptions = {
  directory: string;
  filename: string;
  show_levels?: Array<string>;
  separate_errors?: boolean;
  timestamp?: boolean;
  colors?: boolean;
};
interface LevelColors {
  [key: string]: colors.Color;
}
const level_colors: LevelColors = {
  notice: colors.green,
  info: colors.blue,
  error: colors.red,
  warn: colors.yellow,
  verbose: colors.gray,
};
colors.zalgo;

export class SimpleLogger {
  options: ILoggerOptions;

  constructor(opts: ILoggerOptions) {
    this.options = opts;
  }

  info = (message: string) => {
    this.log(message, "info");
  };
  warn = (message: string) => {
    this.log(message, "warn");
  };
  error = (message: string) => {
    this.log(message, "error");
  };
  verbose = (message: string) => {
    this.log(message, "verbose");
  };
  notice = (message: string) => {
    this.log(message, "notice");
  };

  log(message: string, level: string) {
    let _formattedTimestamp = () => {
      return `[${new Date().toISOString().replace("T", " ").substring(0, 19)}]`;
    };

    let _formattedLevel = (_colors: boolean = this.options.colors, _level:string = level) => {
      if (_colors) {
        return level_colors[_level](`${level.toUpperCase()}:`);
      } else {
        return `${_level.toUpperCase()}:`;
      }
    };

    let _formatedMessage = (_colors: boolean = this.options.colors, _message:string = message, _level:string = level) => {
      if (!_colors) {
        return _message;
      } else {
        if (_level == "notice") {
          return level_colors["notice"](_message);
        } else if (_level == "error") {
          return level_colors["error"](_message);
        } else if (_level == "warn") {
          return level_colors["warn"](_message);
        } else if (_level == "verbose") {
          return level_colors["verbose"](_message);
        } else {
          return colors.cyan(_message);
        }
      }
    };

    let _appendLog = () => {

      let _append = (file: string) => {
        try {
            fs.appendFile(
                file,
                `${_formattedTimestamp()} ${_formattedLevel(false)} ${_formatedMessage(false)}\n`,
                () => {}
              );
        } catch (e) {
              _printLog(_formattedLevel(this.options.colors, "error"), _formatedMessage(this.options.colors, `There was a problem writing ${file}`,"error"))
        }
      };
      if (this.options.separate_errors && level == "error") {
        _append(
          `${this.options.directory}/error-${
            new Date().toISOString().split("T")[0]
          }.log`
        );
      } else {
        _append(
          `${this.options.directory}/${this.options.filename}-${
            new Date().toISOString().split("T")[0]
          }.log`
        );
      }
    };

    let _printLog = (lvl:string = level, msg:string = message) => {
        console.log(`${_formattedTimestamp()} ${_formattedLevel(this.options.colors, lvl)} ${msg}`);
    }

    try {
        if (!fs.existsSync(this.options.directory)){
            fs.mkdirSync(this.options.directory);
            _printLog(_formattedLevel(this.options.colors, "verbose"), _formatedMessage(this.options.colors, `Logs directory ("./${this.options.directory}") created`,"verbose"))
        }        
    } catch {
        _printLog(_formattedLevel(this.options.colors, "error"), _formatedMessage(this.options.colors, "Couldn't create logs directory. Logs are not being saved.", "error"))
    }

    _printLog(level,_formatedMessage())
    _appendLog();

  }
}

export default SimpleLogger;
