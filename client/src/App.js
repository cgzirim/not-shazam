import React, { useEffect, useState, useRef } from "react";
import io from "socket.io-client";
import Form from "./components/Form";
import Listen from "./components/Listen";
import CarouselSliders from "./components/CarouselSliders";
import AnimatedNumber from "react-animated-numbers";
import { FaMicrophoneLines } from "react-icons/fa6";
import { LiaLaptopSolid } from "react-icons/lia";
import { ToastContainer, toast, Slide } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { MediaRecorder, register } from "extendable-media-recorder";
import { connect } from "extendable-media-recorder-wav-encoder";

var socket = io("http://localhost:5000/");

function App() {
  const [stream, setStream] = useState();
  const [matches, setMatches] = useState([]);
  const [totalSongs, setTotalSongs] = useState(10);
  const [isListening, setisListening] = useState(false);
  const [audioInput, setAudioInput] = useState("device");
  const [registeredMediaEncoder, setRegisteredMediaEncoder] = useState(false);

  const streamRef = useRef(stream);
  let sendRecordingRef = useRef(true);

  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);

  useEffect(() => {
    socket.on("connect", () => {
      socket.emit("totalSongs", "");
    });

    socket.on("matches", (matches) => {
      matches = JSON.parse(matches);
      if (matches) {
        setMatches(matches);
        console.log("Matches: ", matches);
      } else {
        toast("No song found.");
      }

      cleanUp();
    });

    socket.on("downloadStatus", (msg) => {
      msg = JSON.parse(msg);
      const msgTypes = ["info", "success", "error"];
      if (msg.type !== undefined && msgTypes.includes(msg.type)) {
        toast[msg.type](() => <div>{msg.message}</div>);
      } else {
        toast(msg.message);
      }
    });

    socket.on("totalSongs", (songsCount) => {
      setTotalSongs(songsCount);
    });
  }, []);

  useEffect(() => {
    const emitTotalSongs = () => {
      socket.emit("totalSongs", "");
    };

    const intervalId = setInterval(emitTotalSongs, 8000);

    return () => clearInterval(intervalId);
  }, []);

  async function record() {
    try {
      const mediaDevice =
        audioInput === "device"
          ? navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices)
          : navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

      if (!registeredMediaEncoder) {
        await register(await connect());
        setRegisteredMediaEncoder(true);
      }

      const constraints = {
        audio: {
          autoGainControl: false,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          sampleSize: 16,
        },
      };

      const stream = await mediaDevice(constraints);
      const audioTracks = stream.getAudioTracks();
      const audioStream = new MediaStream(audioTracks);

      setStream(audioStream);
      audioTracks[0].onended = stopListening;

      // Stop video tracks
      for (const track of stream.getVideoTracks()) {
        track.stop();
      }

      const mediaRecorder = new MediaRecorder(audioStream, {
        mimeType: "audio/wav",
      });

      mediaRecorder.start();
      setisListening(true);
      sendRecordingRef.current = true;

      const chunks = [];
      mediaRecorder.ondataavailable = function (e) {
        chunks.push(e.data);
      };

      // Stop recording after 15 seconds
      setTimeout(function () {
        mediaRecorder.stop();
      }, 15000);

      mediaRecorder.addEventListener("stop", () => {
        const blob = new Blob(chunks, { type: "audio/wav" });
        const reader = new FileReader();
        reader.readAsArrayBuffer(blob);

        // downloadRecord(blob);

        reader.onload = (event) => {
          const arrayBuffer = event.target.result;

          var binary = "";
          var bytes = new Uint8Array(arrayBuffer);
          var len = bytes.byteLength;
          for (var i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
          }

          // Convert byte array to base64
          const rawAudio = btoa(binary);
          const audioConfig = audioStream.getAudioTracks()[0].getSettings();

          const recordData = {
            audio: rawAudio,
            channels: audioConfig.channelCount,
            sampleRate: audioConfig.sampleRate,
            sampleSize: audioConfig.sampleSize,
          };

          if (sendRecordingRef.current) {
            socket.emit("record", JSON.stringify(recordData));
          }
        };
      });
    } catch (error) {
      console.error("error:", error);
      // Handle errors gracefully
    }
  }

  function downloadRecord(blob) {
    const blobUrl = URL.createObjectURL(blob);

    // Create a download link
    const downloadLink = document.createElement("a");
    downloadLink.href = blobUrl;
    downloadLink.download = "recorded_audio.wav";
    document.body.appendChild(downloadLink);
    downloadLink.click();
  }

  function cleanUp() {
    const currentStream = streamRef.current;
    if (currentStream) {
      currentStream.getTracks().forEach((track) => track.stop());
    }

    setStream(null);
    setisListening(false);
  }

  function stopListening() {
    sendRecordingRef.current = false;
    cleanUp();
  }

  function handleLaptopIconClick() {
    setAudioInput("device");
  }

  function handleMicrophoneIconClick() {
    setAudioInput("mic");
  }

  return (
    <div className="App">
      <div className="TopHeader">
        <h1 style={{ color: "#374151" }}>!Shazam</h1>
        <h4 style={{ display: "flex", justifyContent: "flex-end" }}>
          <AnimatedNumber
            includeComma
            animateToNumber={totalSongs}
            config={{ tension: 89, friction: 40 }}
            animationType={"calm"}
          />
          &nbsp;Songs
        </h4>
      </div>
      <div className="listen">
        <Listen
          stopListening={stopListening}
          disable={false}
          startListening={record}
          isListening={isListening}
        />
      </div>
      <div className="audio-input">
        <div
          onClick={handleLaptopIconClick}
          className={
            audioInput !== "device"
              ? "audio-input-device"
              : "audio-input-device active-audio-input"
          }
        >
          <LiaLaptopSolid style={{ height: 20, width: 20 }} />
        </div>
        <div
          onClick={handleMicrophoneIconClick}
          className={
            audioInput !== "mic"
              ? "audio-input-mic"
              : "audio-input-mic active-audio-input"
          }
        >
          <FaMicrophoneLines style={{ height: 20, width: 20 }} />
        </div>
      </div>
      <div className="youtube">
        <CarouselSliders matches={matches} />
      </div>
      <Form socket={socket} toast={toast} />
      <ToastContainer
        position="top-center"
        autoClose={5000}
        hideProgressBar={true}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light"
        transition={Slide}
      />
    </div>
  );
}

export default App;