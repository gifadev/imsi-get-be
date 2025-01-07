import serial
import time

def send_serial_command(command):
    try:
        port = '/dev/ttyUSB0'
        baudrate = 115200  

        ser = serial.Serial(port, baudrate)

        ser.write(command.encode())

        response = ser.readline().decode().strip()
        print(f'Response: {response}')

        ser.close()

    except Exception as e:
        print(f'Error: {e}')

if __name__ == "__main__":
    send_serial_command("B")
