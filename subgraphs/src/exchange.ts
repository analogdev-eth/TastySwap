/* eslint-disable node/no-missing-import */
import { BigInt, Address, BigDecimal } from "@graphprotocol/graph-ts";
import {
  Exchange,
  LiquidityAdded,
  LiquidityRemoved,
  Swap,
} from "../generated/Exchange/Exchange";
import { Candle, Liquidity, Volume } from "../generated/schema";
import { getCurrentPeriodTimestamp } from "./utils";

// -> helper function
function getReserves(address: Address): BigInt[] {
  const pairExchangeContract = Exchange.bind(address);
  const reserves = pairExchangeContract.getReserves();

  return [reserves.getValue0(), reserves.getValue1()];
}

function getPrice(pair: Address): BigDecimal {
  const reserves = getReserves(pair);
  const price: BigDecimal = reserves[0].divDecimal(reserves[1].toBigDecimal());
  return price;
}

// -> event handlers
export function handleLiquidityAdded(event: LiquidityAdded): void {
  // keeps track of liquidity hourly
  const liquidityId = getCurrentPeriodTimestamp("H1").toString();
  const reserves = getReserves(event.params.pair);
  let liquidity = Liquidity.load(liquidityId);
  if (!liquidity) {
    liquidity = new Liquidity(liquidityId);
    liquidity.pair = event.params.pair;
    liquidity.ethAmount = reserves[0];
    liquidity.tokenAmount = reserves[1];
    liquidity.timestamp = getCurrentPeriodTimestamp("H1");
  } else {
    liquidity.ethAmount = liquidity.ethAmount.plus(event.params.ethAmountIn);
    liquidity.tokenAmount = liquidity.tokenAmount.plus(
      event.params.tokenAmountIn
    );
  }

  liquidity.save();
}

export function handleLiquidityRemoved(event: LiquidityRemoved): void {
  // keeps track of liquidity hourly
  const liquidityId = getCurrentPeriodTimestamp("H1").toString();
  const reserves = getReserves(event.params.pair);
  let liquidity = Liquidity.load(liquidityId);
  if (!liquidity) {
    liquidity = new Liquidity(liquidityId);
    liquidity.pair = event.params.pair;
    liquidity.ethAmount = reserves[0];
    liquidity.tokenAmount = reserves[1];
    liquidity.timestamp = getCurrentPeriodTimestamp("H1");
  } else {
    liquidity.ethAmount = liquidity.ethAmount.minus(event.params.ethAmountOut);
    liquidity.tokenAmount = liquidity.tokenAmount.plus(
      event.params.tokenAmountOut
    );
  }

  liquidity.save();
}

export function handleSwap(event: Swap): void {
  // keep track of volume hourly
  const volumeId = getCurrentPeriodTimestamp("H1").toString();
  let volume = Volume.load(volumeId);
  if (!volume) {
    volume = new Volume(volumeId);
    volume.pair = event.params.pair;
    volume.timestamp = getCurrentPeriodTimestamp("H1");
    volume.volumeInEth = event.params.ethAmountIn.plus(
      event.params.ethAmountOut
    );
  } else {
    volume.volumeInEth = volume.volumeInEth
      .plus(event.params.ethAmountIn)
      .plus(event.params.ethAmountOut);
  }
  volume.save();

  // keep track of dex-candles
  const periods: string[] = ["H1", "H4", "D1"];
  const price = getPrice(event.params.pair);
  for (let i = 0; i < periods.length; i++) {
    const candleId = getCurrentPeriodTimestamp(periods[i]).toString();
    let candle = Candle.load(candleId);
    if (!candle) {
      candle = new Candle(candleId);
      candle.period = periods[i];
      candle.open = price;
      candle.high = price;
      candle.low = price;
      candle.close = price;
      candle.ethVolume = BigInt.fromI32(0);
      candle.tokenVolume = BigInt.fromI32(0);
      candle.openedAt = getCurrentPeriodTimestamp(periods[i]);
    } else {
      if (price > candle.high) {
        candle.high = price;
      }
      if (price < candle.low) {
        candle.low = price;
      }
    }

    candle.close = price;
    candle.ethVolume = candle.ethVolume
      .plus(event.params.ethAmountIn)
      .plus(event.params.ethAmountOut);
    candle.tokenVolume = candle.tokenVolume
      .plus(event.params.tokenAmountIn)
      .plus(event.params.tokenAmountOut);
    candle.lastBlock = event.block.number.toI32();

    candle.save();
  }
}
